/**
 * Search-based code navigation — shared types and pure logic.
 *
 * Runtime-agnostic: both Bun and Node servers provide their own
 * CodeNavRuntime implementation to run subprocess commands.
 */

import { Option, Schema } from "effect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeNavRequest {
  symbol: string;
  filePath: string;
  line: number;
  charStart: number;
  side: "old" | "new";
  language?: string;
}

/** Validated fields used by search-based code navigation. */
export interface CodeNavResolveRequest {
  symbol: string;
  filePath: string;
  side: "old" | "new";
  language?: string;
}

export interface CodeNavLocation {
  kind: "definition" | "reference";
  confidence: "likely" | "possible";
  filePath: string;
  line: number;
  column: number;
  snippet: string;
}

export interface CodeNavResponse {
  backend: "search" | "unavailable";
  complete: boolean;
  definitions: CodeNavLocation[];
  references: CodeNavLocation[];
  stats: { elapsedMs: number; capped: boolean };
  searchScope: "head";
}

export interface CodeNavRuntime {
  runCommand: (
    command: string,
    args: string[],
    options?: { cwd?: string; timeoutMs?: number },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

/** HTTP request fields required to resolve code navigation. */
const CodeNavSymbolSchema = Schema.String.pipe(
  Schema.check(Schema.makeFilter((symbol) =>
    symbol.trim() ? undefined : "symbol must be nonempty after trimming",
  )),
);

/** HTTP file path that remains within the review workspace. */
const CodeNavFilePathSchema = Schema.String.pipe(
  Schema.check(Schema.makeFilter((filePath) => {
    if (!filePath.trim()) return "filePath must be nonempty after trimming";
    return filePath.includes("..") || filePath.startsWith("/")
      ? "filePath must be a safe relative path"
      : undefined;
  })),
);

/** Code navigation request accepted at the HTTP boundary. Legacy cursor fields remain unvalidated. */
export const CodeNavRequestSchema = Schema.Struct({
  symbol: CodeNavSymbolSchema,
  filePath: CodeNavFilePathSchema,
  side: Schema.Literals(["old", "new"]),
  line: Schema.optionalKey(Schema.Unknown),
  charStart: Schema.optionalKey(Schema.Unknown),
  language: Schema.optionalKey(Schema.Unknown),
});

/** Code navigation result location returned by the HTTP endpoint. */
const CodeNavLocationSchema = Schema.Struct({
  kind: Schema.Literals(["definition", "reference"]),
  confidence: Schema.Literals(["likely", "possible"]),
  filePath: Schema.String,
  line: Schema.Number,
  column: Schema.Number,
  snippet: Schema.String,
});

/** Complete successful code navigation response returned by the HTTP endpoint. */
export const CodeNavResponseSchema = Schema.Struct({
  backend: Schema.Literals(["search", "unavailable"]),
  complete: Schema.Boolean,
  definitions: Schema.Array(CodeNavLocationSchema),
  references: Schema.Array(CodeNavLocationSchema),
  stats: Schema.Struct({ elapsedMs: Schema.Number, capped: Schema.Boolean }),
  searchScope: Schema.Literal("head"),
});

/** Decode an untrusted code navigation HTTP request. */
export const decodeCodeNavRequest = Schema.decodeUnknownOption(CodeNavRequestSchema);

/** Decode an untrusted successful code navigation HTTP response. */
export const decodeCodeNavResponse = Schema.decodeUnknownOption(CodeNavResponseSchema);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CODE_NAV_IGNORED_GLOBS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".turbo",
  ".cache",
  "target",
  "vendor",
  "coverage",
  ".venv",
  ".pytest_cache",
];

interface RgTypeMap {
  readonly [language: string]: string;
}

const RG_TYPE_MAP: RgTypeMap = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  go: "go",
  rust: "rust",
  java: "java",
  ruby: "ruby",
  cpp: "cpp",
  c: "c",
};

// ---------------------------------------------------------------------------
// Definition patterns
// ---------------------------------------------------------------------------

interface DefinitionPatternSet {
  languages: string[];
  patterns: string[];
}

const DEFINITION_PATTERNS: DefinitionPatternSet[] = [
  {
    languages: ["typescript", "javascript"],
    patterns: [
      String.raw`(?:export\s+)?(?:async\s+)?function\s+SYMBOL\b`,
      String.raw`(?:export\s+)?(?:const|let|var)\s+SYMBOL\s*[=:]`,
      String.raw`(?:export\s+)?class\s+SYMBOL\b`,
      String.raw`(?:export\s+)?(?:interface|type)\s+SYMBOL\b`,
      String.raw`(?:export\s+)?enum\s+SYMBOL\b`,
      String.raw`^\s+(?:(?:async|static|readonly|get|set|private|protected|public)\s+)+SYMBOL\s*[(<:]`,
    ],
  },
  {
    languages: ["python"],
    patterns: [
      String.raw`(?:^|\s)def\s+SYMBOL\s*\(`,
      String.raw`(?:^|\s)class\s+SYMBOL\b`,
      String.raw`^SYMBOL\s*=`,
    ],
  },
  {
    languages: ["go"],
    patterns: [
      String.raw`func\s+(?:\([^)]+\)\s+)?SYMBOL\s*\(`,
      String.raw`type\s+SYMBOL\s`,
      String.raw`var\s+SYMBOL\s`,
    ],
  },
  {
    languages: ["rust"],
    patterns: [
      String.raw`(?:pub(?:\([^)]*\))?\s+)?fn\s+SYMBOL\b`,
      String.raw`(?:pub(?:\([^)]*\))?\s+)?struct\s+SYMBOL\b`,
      String.raw`(?:pub(?:\([^)]*\))?\s+)?enum\s+SYMBOL\b`,
      String.raw`(?:pub(?:\([^)]*\))?\s+)?trait\s+SYMBOL\b`,
      String.raw`(?:pub(?:\([^)]*\))?\s+)?type\s+SYMBOL\b`,
      String.raw`(?:pub(?:\([^)]*\))?\s+)?mod\s+SYMBOL\b`,
    ],
  },
];

const GENERIC_DEFINITION_PATTERNS: string[] = [
  String.raw`(?:function|def|func|fn|class|struct|enum|trait|interface|type)\s+SYMBOL\b`,
  String.raw`(?:const|let|var|val)\s+SYMBOL\s*[=:]`,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sameDirectory(a: string, b: string): boolean {
  const dirA = a.lastIndexOf("/");
  const dirB = b.lastIndexOf("/");
  if (dirA === -1 && dirB === -1) return true;
  return a.slice(0, dirA) === b.slice(0, dirB);
}

function isTestFile(filePath: string): boolean {
  return /(?:test|spec|__tests__|_test\.|\.test\.|\.spec\.)/i.test(filePath);
}

// ---------------------------------------------------------------------------
// rg argument construction
// ---------------------------------------------------------------------------

export function buildRgArgs(symbol: string, language?: string): string[] {
  const args: string[] = [
    "--json",
    "--line-number",
    "--column",
    "--max-count",
    "50",
    "--max-filesize",
    "1M",
    "--no-messages",
  ];

  for (const dir of CODE_NAV_IGNORED_GLOBS) {
    args.push("--glob", `!${dir}`);
  }

  if (language) {
    const rgType = RG_TYPE_MAP[language];
    if (rgType) args.push("--type", rgType);
  }

  args.push("--word-regexp", "--", escapeRegex(symbol), ".");

  return args;
}

// ---------------------------------------------------------------------------
// rg JSON output parsing
// ---------------------------------------------------------------------------

const RgMatchRecordSchema = Schema.Struct({
  type: Schema.Literal("match"),
  data: Schema.Struct({
    path: Schema.Struct({ text: Schema.String }),
    lines: Schema.Struct({ text: Schema.String }),
    line_number: Schema.Number,
    submatches: Schema.optionalKey(Schema.Unknown),
  }),
});

const RgSubmatchSchema = Schema.Struct({ start: Schema.Number });

const decodeRgMatchRecordLine = Schema.decodeUnknownOption(
  Schema.fromJsonString(RgMatchRecordSchema),
);

const decodeRgSubmatch = Schema.decodeUnknownOption(RgSubmatchSchema);

const PARSE_CAP = 500;

export function parseRgJsonOutput(
  stdout: string,
  symbol: string,
  language?: string,
): CodeNavLocation[] {
  const locations: CodeNavLocation[] = [];
  const lines = stdout.split("\n");

  for (const line of lines) {
    if (locations.length >= PARSE_CAP) break;
    if (!line.trim()) continue;

    const parsed = Option.getOrUndefined(decodeRgMatchRecordLine(line));
    if (!parsed) continue;

    const d = parsed.data;
    const snippet = d.lines.text.trimEnd();
    const firstSubmatch = Array.isArray(d.submatches)
      ? d.submatches[0]
      : undefined;
    const column = Option.getOrUndefined(decodeRgSubmatch(firstSubmatch))?.start ?? 0;
    const kind = classifyMatch(snippet, symbol, language);
    const filePath = d.path.text.startsWith("./")
      ? d.path.text.slice(2)
      : d.path.text;

    locations.push({
      kind,
      confidence: kind === "definition" ? "likely" : "possible",
      filePath,
      line: d.line_number,
      column,
      snippet: snippet.length > 200 ? snippet.slice(0, 200) + "…" : snippet,
    });
  }

  return locations;
}

// ---------------------------------------------------------------------------
// Match classification
// ---------------------------------------------------------------------------

export function classifyMatch(
  snippet: string,
  symbol: string,
  language?: string,
): "definition" | "reference" {
  const escaped = escapeRegex(symbol);

  if (language) {
    const langPatterns = DEFINITION_PATTERNS.find((p) =>
      p.languages.includes(language),
    );
    if (langPatterns) {
      for (const pattern of langPatterns.patterns) {
        const re = new RegExp(pattern.replace("SYMBOL", escaped));
        if (re.test(snippet)) return "definition";
      }
    }
  }

  for (const pattern of GENERIC_DEFINITION_PATTERNS) {
    const re = new RegExp(pattern.replace("SYMBOL", escaped));
    if (re.test(snippet)) return "definition";
  }

  return "reference";
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

interface RankedCodeNavResult {
  readonly definitions: CodeNavLocation[];
  readonly references: CodeNavLocation[];
  readonly capped: boolean;
}

export function rankLocations(
  locations: CodeNavLocation[],
  context: {
    sourceFilePath: string;
    changedFiles: string[];
    isTestFile: boolean;
  },
  cap = 50,
): RankedCodeNavResult {
  const capped = locations.length > cap;
  const changedSet = new Set(context.changedFiles);

  function score(loc: CodeNavLocation): number {
    let s = 0;

    if (loc.filePath === context.sourceFilePath) s += 1000;
    else if (changedSet.has(loc.filePath)) s += 500;
    else if (sameDirectory(loc.filePath, context.sourceFilePath)) s += 200;

    if (isTestFile(loc.filePath) && !context.isTestFile) s -= 300;

    if (loc.kind === "definition") s += 100;
    if (loc.confidence === "likely") s += 50;

    return s;
  }

  const sorted = [...locations].sort((a, b) => score(b) - score(a));
  const truncated = sorted.slice(0, cap);

  return {
    definitions: truncated.filter((l) => l.kind === "definition"),
    references: truncated.filter((l) => l.kind === "reference"),
    capped,
  };
}

// ---------------------------------------------------------------------------
// Changed files extraction from unified diff patch
// ---------------------------------------------------------------------------

export function extractChangedFiles(patch: string | null): string[] {
  if (!patch) return [];
  const set = new Set<string>();
  const re = /^diff --git a\/(.+?) b\/(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(patch)) !== null) {
    set.add(m[1]);
    set.add(m[2]);
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface CodeNavRequestValidationBody {
  readonly symbol?: unknown;
  readonly filePath?: unknown;
  readonly side?: unknown;
}

export function validateCodeNavRequest(
  body: CodeNavRequestValidationBody | null,
): string | null {
  if (!body) return "Invalid request body";
  const symbol = Option.getOrUndefined(Schema.decodeUnknownOption(CodeNavSymbolSchema)(body.symbol));
  if (!symbol) {
    return "Missing or empty symbol";
  }
  const filePath = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(body.filePath));
  if (!filePath || !filePath.trim()) {
    return "Missing filePath";
  }
  if (!Option.getOrUndefined(Schema.decodeUnknownOption(CodeNavFilePathSchema)(filePath))) {
    return "Invalid filePath";
  }
  const side = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.Literals(["old", "new"]))(body.side),
  );
  if (!side) {
    return "side must be 'old' or 'new'";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

let rgAvailable: boolean | null = null;

export async function resolveCodeNav(
  runtime: CodeNavRuntime,
  request: CodeNavResolveRequest,
  cwd: string,
  changedFiles: string[],
): Promise<CodeNavResponse> {
  const start = Date.now();

  if (rgAvailable === null) {
    const check = await runtime.runCommand("rg", ["--version"], {
      cwd,
      timeoutMs: 2000,
    });
    rgAvailable = check.exitCode === 0;
  }

  if (!rgAvailable) {
    return {
      backend: "unavailable",
      complete: true,
      definitions: [],
      references: [],
      searchScope: "head",
      stats: { elapsedMs: Date.now() - start, capped: false },
    };
  }

  const args = buildRgArgs(request.symbol, request.language);

  const result = await runtime.runCommand("rg", args, {
    cwd,
    timeoutMs: 5000,
  });

  // Exit code 1 = no matches (normal), exit code 2 = error
  if (result.exitCode === 2) {
    return {
      backend: "search",
      complete: true,
      definitions: [],
      references: [],
      searchScope: "head",
      stats: { elapsedMs: Date.now() - start, capped: false },
    };
  }

  const locations = parseRgJsonOutput(
    result.stdout,
    request.symbol,
    request.language,
  );

  const ranked = rankLocations(locations, {
    sourceFilePath: request.filePath,
    changedFiles,
    isTestFile: isTestFile(request.filePath),
  });

  return {
    backend: "search",
    complete: true,
    definitions: ranked.definitions,
    references: ranked.references,
    searchScope: "head",
    stats: { elapsedMs: Date.now() - start, capped: ranked.capped },
  };
}

export function resetRgCache(): void {
  rgAvailable = null;
}
