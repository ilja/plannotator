import { describe, expect, test } from "bun:test";
import { Option } from "effect";
import {
  buildRgArgs,
  classifyMatch,
  decodeCodeNavRequest,
  decodeCodeNavResponse,
  rankLocations,
  parseRgJsonOutput,
  extractChangedFiles,
  type CodeNavLocation,
} from "./code-nav";

// ---------------------------------------------------------------------------
// classifyMatch
// ---------------------------------------------------------------------------

describe("classifyMatch", () => {
  describe("TypeScript/JavaScript", () => {
    const lang = "typescript";

    test("function declaration", () => {
      expect(classifyMatch("function startServer(", "startServer", lang)).toBe("definition");
    });

    test("async function declaration", () => {
      expect(classifyMatch("export async function startServer(", "startServer", lang)).toBe("definition");
    });

    test("export function", () => {
      expect(classifyMatch("export function handleRequest(", "handleRequest", lang)).toBe("definition");
    });

    test("const assignment", () => {
      expect(classifyMatch("const startServer = async () => {", "startServer", lang)).toBe("definition");
    });

    test("let assignment", () => {
      expect(classifyMatch("let counter = 0;", "counter", lang)).toBe("definition");
    });

    test("class declaration", () => {
      expect(classifyMatch("export class ReviewServer {", "ReviewServer", lang)).toBe("definition");
    });

    test("interface declaration", () => {
      expect(classifyMatch("export interface CodeNavRequest {", "CodeNavRequest", lang)).toBe("definition");
    });

    test("type declaration", () => {
      expect(classifyMatch("type DiffType = 'unified' | 'split';", "DiffType", lang)).toBe("definition");
    });

    test("enum declaration", () => {
      expect(classifyMatch("enum Status {", "Status", lang)).toBe("definition");
    });

    test("method in class/object", () => {
      expect(classifyMatch("  async handleRequest(", "handleRequest", lang)).toBe("definition");
    });

    test("plain reference (function call)", () => {
      expect(classifyMatch("  const result = startServer(config);", "startServer", lang)).toBe("reference");
    });

    test("bare indented call is not a definition", () => {
      expect(classifyMatch("  startServer(config);", "startServer", lang)).toBe("reference");
    });

    test("indented call in if/return is not a definition", () => {
      expect(classifyMatch("    return startServer(config);", "startServer", lang)).toBe("reference");
    });

    test("plain reference (import)", () => {
      expect(classifyMatch('import { startServer } from "./server";', "startServer", lang)).toBe("reference");
    });

    test("const with type annotation", () => {
      expect(classifyMatch("const runtime: CodeNavRuntime = {", "runtime", lang)).toBe("definition");
    });
  });

  describe("Python", () => {
    const lang = "python";

    test("def function", () => {
      expect(classifyMatch("def handle_request(self, req):", "handle_request", lang)).toBe("definition");
    });

    test("class declaration", () => {
      expect(classifyMatch("class ReviewServer:", "ReviewServer", lang)).toBe("definition");
    });

    test("top-level assignment", () => {
      expect(classifyMatch("DEFAULT_PORT = 8080", "DEFAULT_PORT", lang)).toBe("definition");
    });

    test("plain reference", () => {
      expect(classifyMatch("  server = ReviewServer()", "ReviewServer", lang)).toBe("reference");
    });
  });

  describe("Go", () => {
    const lang = "go";

    test("func declaration", () => {
      expect(classifyMatch("func StartServer(config Config) error {", "StartServer", lang)).toBe("definition");
    });

    test("method declaration", () => {
      expect(classifyMatch("func (s *Server) StartServer() error {", "StartServer", lang)).toBe("definition");
    });

    test("type declaration", () => {
      expect(classifyMatch("type Config struct {", "Config", lang)).toBe("definition");
    });

    test("plain reference", () => {
      expect(classifyMatch("  err := StartServer(cfg)", "StartServer", lang)).toBe("reference");
    });
  });

  describe("Rust", () => {
    const lang = "rust";

    test("fn declaration", () => {
      expect(classifyMatch("fn start_server() -> Result<()> {", "start_server", lang)).toBe("definition");
    });

    test("pub fn declaration", () => {
      expect(classifyMatch("pub fn start_server(config: Config) {", "start_server", lang)).toBe("definition");
    });

    test("struct declaration", () => {
      expect(classifyMatch("pub struct Config {", "Config", lang)).toBe("definition");
    });

    test("enum declaration", () => {
      expect(classifyMatch("pub enum Status {", "Status", lang)).toBe("definition");
    });

    test("trait declaration", () => {
      expect(classifyMatch("pub trait Handler {", "Handler", lang)).toBe("definition");
    });

    test("plain reference", () => {
      expect(classifyMatch("  let server = start_server(config);", "start_server", lang)).toBe("reference");
    });
  });

  describe("generic fallback", () => {
    test("function keyword (unknown language)", () => {
      expect(classifyMatch("function startServer(", "startServer")).toBe("definition");
    });

    test("class keyword (unknown language)", () => {
      expect(classifyMatch("class MyClass {", "MyClass")).toBe("definition");
    });

    test("const keyword (unknown language)", () => {
      expect(classifyMatch("const PORT = 8080;", "PORT")).toBe("definition");
    });

    test("no definition pattern matches", () => {
      expect(classifyMatch("  startServer(config);", "startServer")).toBe("reference");
    });
  });

  describe("edge cases", () => {
    test("regex metacharacter in symbol ($)", () => {
      expect(classifyMatch("const $el = document.querySelector('div');", "$el", "typescript")).toBe("definition");
    });

    test("regex metacharacter in symbol (.)", () => {
      expect(classifyMatch("  obj.method();", "obj.method")).toBe("reference");
    });
  });
});

// ---------------------------------------------------------------------------
// rankLocations
// ---------------------------------------------------------------------------

describe("rankLocations", () => {
  function loc(overrides: Partial<CodeNavLocation>): CodeNavLocation {
    return {
      kind: "reference",
      confidence: "possible",
      filePath: "src/other.ts",
      line: 1,
      column: 0,
      snippet: "some code",
      ...overrides,
    };
  }

  test("same file ranks first", () => {
    const locations = [
      loc({ filePath: "src/other.ts", line: 10 }),
      loc({ filePath: "src/main.ts", line: 5 }),
    ];
    const result = rankLocations(locations, {
      sourceFilePath: "src/main.ts",
      changedFiles: [],
      isTestFile: false,
    });
    expect(result.references[0].filePath).toBe("src/main.ts");
  });

  test("changed files rank above non-changed", () => {
    const locations = [
      loc({ filePath: "lib/utils.ts" }),
      loc({ filePath: "src/changed.ts" }),
    ];
    const result = rankLocations(locations, {
      sourceFilePath: "src/main.ts",
      changedFiles: ["src/changed.ts"],
      isTestFile: false,
    });
    expect(result.references[0].filePath).toBe("src/changed.ts");
  });

  test("definitions rank above references in same tier", () => {
    const locations = [
      loc({ filePath: "src/a.ts", kind: "reference" }),
      loc({ filePath: "src/a.ts", kind: "definition", confidence: "likely" }),
    ];
    const result = rankLocations(locations, {
      sourceFilePath: "src/main.ts",
      changedFiles: [],
      isTestFile: false,
    });
    expect(result.definitions).toHaveLength(1);
    expect(result.references).toHaveLength(1);
  });

  test("test files demoted when source is not a test", () => {
    const locations = [
      loc({ filePath: "src/__tests__/main.test.ts", kind: "reference" }),
      loc({ filePath: "src/utils.ts", kind: "reference" }),
    ];
    const result = rankLocations(locations, {
      sourceFilePath: "src/main.ts",
      changedFiles: [],
      isTestFile: false,
    });
    expect(result.references[0].filePath).toBe("src/utils.ts");
  });

  test("test files NOT demoted when source is a test", () => {
    const locations = [
      loc({ filePath: "src/__tests__/main.test.ts", kind: "reference" }),
      loc({ filePath: "src/utils.ts", kind: "reference" }),
    ];
    const result = rankLocations(locations, {
      sourceFilePath: "src/__tests__/other.test.ts",
      changedFiles: [],
      isTestFile: true,
    });
    expect(result.references[0].filePath).toBe("src/__tests__/main.test.ts");
  });

  test("caps results", () => {
    const locations = Array.from({ length: 100 }, (_, i) =>
      loc({ filePath: `src/file${i}.ts`, line: i }),
    );
    const result = rankLocations(locations, {
      sourceFilePath: "src/main.ts",
      changedFiles: [],
      isTestFile: false,
    }, 10);
    expect(result.references).toHaveLength(10);
    expect(result.capped).toBe(true);
  });

  test("not capped when under limit", () => {
    const locations = [loc({}), loc({})];
    const result = rankLocations(locations, {
      sourceFilePath: "src/main.ts",
      changedFiles: [],
      isTestFile: false,
    });
    expect(result.capped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildRgArgs
// ---------------------------------------------------------------------------

describe("buildRgArgs", () => {
  test("includes --json flag", () => {
    const args = buildRgArgs("mySymbol");
    expect(args).toContain("--json");
  });

  test("includes --word-regexp", () => {
    const args = buildRgArgs("mySymbol");
    expect(args).toContain("--word-regexp");
  });

  test("includes glob exclusions for node_modules", () => {
    const args = buildRgArgs("mySymbol");
    const nodeModulesIdx = args.indexOf("!node_modules");
    expect(nodeModulesIdx).toBeGreaterThan(-1);
  });

  test("escapes regex metacharacters", () => {
    const args = buildRgArgs("$scope");
    const patternIdx = args.indexOf("--") + 1;
    expect(args[patternIdx]).toContain("\\$scope");
  });

  test("includes max-count", () => {
    const args = buildRgArgs("x");
    const idx = args.indexOf("--max-count");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("50");
  });

  test("searches from current directory", () => {
    const args = buildRgArgs("x");
    expect(args[args.length - 1]).toBe(".");
  });

  test("adds --type filter for known language", () => {
    const args = buildRgArgs("x", "typescript");
    const typeIdx = args.indexOf("--type");
    expect(typeIdx).toBeGreaterThan(-1);
    expect(args[typeIdx + 1]).toBe("ts");
  });

  test("no --type filter for unknown language", () => {
    const args = buildRgArgs("x", "brainfuck");
    expect(args).not.toContain("--type");
  });

  test("no --type filter when language is undefined", () => {
    const args = buildRgArgs("x");
    expect(args).not.toContain("--type");
  });
});

// ---------------------------------------------------------------------------
// parseRgJsonOutput
// ---------------------------------------------------------------------------

describe("parseRgJsonOutput", () => {
  test("parses match lines", () => {
    const lines = [
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "src/server.ts" },
          lines: { text: "export function startServer() {\n" },
          line_number: 42,
          submatches: [{ start: 16, end: 27, match: { text: "startServer" } }],
        },
      }),
      JSON.stringify({ type: "summary", data: {} }),
    ].join("\n");

    const result = parseRgJsonOutput(lines, "startServer", "typescript");
    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe("src/server.ts");
    expect(result[0].line).toBe(42);
    expect(result[0].column).toBe(16);
    expect(result[0].kind).toBe("definition");
    expect(result[0].confidence).toBe("likely");
    expect(result[0].snippet).toBe("export function startServer() {");
  });

  test("retains valid matches around malformed JSON records", () => {
    type TestSubmatches =
      | ReadonlyArray<{ readonly start: number | string }>
      | { readonly start: number };
    interface TestRgMatchData {
      path: { text: string };
      lines: { text: string };
      line_number: number;
      submatches?: TestSubmatches;
    }

    const validMatch = (
      path: string,
      lineNumber: number,
      submatches?: TestSubmatches,
    ) => {
      const data: TestRgMatchData = {
        path: { text: path },
        lines: { text: `  startServer(); // ${path}\n` },
        line_number: lineNumber,
      };
      if (submatches !== undefined) data.submatches = submatches;

      return JSON.stringify({ type: "match", data });
    };
    const lines = [
      validMatch("./src/before.ts", 1, [{ start: 2 }]),
      "not JSON",
      JSON.stringify({ type: "begin", data: {} }),
      JSON.stringify({ type: "match", data: null }),
      JSON.stringify({ type: "match", data: { path: { text: 1 }, lines: { text: "x" }, line_number: 2 } }),
      JSON.stringify({ type: "match", data: { path: { text: "src/missing-lines.ts" }, line_number: 3 } }),
      JSON.stringify({ type: "match", data: { path: { text: "src/bad-lines.ts" }, lines: { text: 1 }, line_number: 4 } }),
      JSON.stringify({ type: "match", data: { path: { text: "src/bad-line.ts" }, lines: { text: "x" }, line_number: "4" } }),
      JSON.stringify({ type: "summary", data: {} }),
      validMatch("src/missing-submatches.ts", 5),
      validMatch("src/non-array-submatches.ts", 6, { start: 7 }),
      validMatch("src/bad-submatch.ts", 7, [{ start: "bad" }]),
      validMatch("src/after.ts", 8, [{ start: 9 }]),
    ].join("\n");

    expect(parseRgJsonOutput(lines, "startServer", "typescript")).toMatchObject([
      { filePath: "src/before.ts", line: 1, column: 2 },
      { filePath: "src/missing-submatches.ts", line: 5, column: 0 },
      { filePath: "src/non-array-submatches.ts", line: 6, column: 0 },
      { filePath: "src/bad-submatch.ts", line: 7, column: 0 },
      { filePath: "src/after.ts", line: 8, column: 9 },
    ]);
  });

  test("classifies references correctly", () => {
    const lines = JSON.stringify({
      type: "match",
      data: {
        path: { text: "src/index.ts" },
        lines: { text: "  const s = startServer();\n" },
        line_number: 10,
        submatches: [{ start: 14, end: 25, match: { text: "startServer" } }],
      },
    });

    const result = parseRgJsonOutput(lines, "startServer", "typescript");
    expect(result[0].kind).toBe("reference");
    expect(result[0].confidence).toBe("possible");
  });

  test("skips non-JSON lines", () => {
    const result = parseRgJsonOutput("not json\n\n", "x");
    expect(result).toHaveLength(0);
  });

  test("strips leading ./ from file paths", () => {
    const line = JSON.stringify({
      type: "match",
      data: {
        path: { text: "./src/server.ts" },
        lines: { text: "  startServer();\n" },
        line_number: 10,
        submatches: [{ start: 2, end: 13, match: { text: "startServer" } }],
      },
    });
    const result = parseRgJsonOutput(line, "startServer");
    expect(result[0].filePath).toBe("src/server.ts");
  });

  test("skips non-match type lines", () => {
    const line = JSON.stringify({ type: "begin", data: { path: { text: "a.ts" } } });
    const result = parseRgJsonOutput(line, "x");
    expect(result).toHaveLength(0);
  });

  test("truncates long snippets", () => {
    const longLine = "x".repeat(300);
    const line = JSON.stringify({
      type: "match",
      data: {
        path: { text: "a.ts" },
        lines: { text: longLine },
        line_number: 1,
        submatches: [{ start: 0, end: 1 }],
      },
    });
    const result = parseRgJsonOutput(line, "x");
    expect(result[0].snippet.length).toBeLessThanOrEqual(201);
  });
});

// ---------------------------------------------------------------------------
// HTTP wire schemas
// ---------------------------------------------------------------------------

describe("code navigation HTTP wire schemas", () => {
  const valid = {
    symbol: "startServer",
    filePath: "src/server.ts",
    line: 42,
    charStart: 10,
    side: "new" as const,
    language: "typescript",
  };

  const validResponse = {
    backend: "search",
    complete: true,
    definitions: [{
      kind: "definition",
      confidence: "likely",
      filePath: "src/server.ts",
      line: 42,
      column: 10,
      snippet: "export function startServer() {}",
    }],
    references: [{
      kind: "reference",
      confidence: "possible",
      filePath: "src/index.ts",
      line: 8,
      column: 3,
      snippet: "startServer();",
    }],
    stats: { elapsedMs: 12, capped: false },
    searchScope: "head",
  };

  test("accepts requests with legacy navigation fields without validating them", () => {
    const decoded = Option.getOrUndefined(decodeCodeNavRequest({
      ...valid,
      line: "not-a-line-number",
      charStart: null,
      language: { unsupported: true },
    }));

    expect(decoded).toMatchObject({
      symbol: "startServer",
      filePath: "src/server.ts",
      side: "new",
    });
  });

  test("accepts a symbol that is nonempty after trimming", () => {
    expect(Option.getOrUndefined(decodeCodeNavRequest({ ...valid, symbol: " startServer " }))).toBeDefined();
  });

  test("accepts both sides without legacy navigation fields", () => {
    for (const side of ["old", "new"] as const) {
      expect(Option.getOrUndefined(decodeCodeNavRequest({
        symbol: "startServer",
        filePath: "src/server.ts",
        side,
      }))).toMatchObject({ side });
    }
  });

  test("rejects malformed request envelopes", () => {
    for (const malformed of [
      null,
      {},
      { ...valid, symbol: 42 },
      { ...valid, symbol: "   " },
      { ...valid, filePath: 42 },
      { ...valid, filePath: "   " },
      { ...valid, filePath: "../etc/passwd" },
      { ...valid, filePath: "/etc/passwd" },
      { ...valid, side: "both" },
    ]) {
      expect(Option.getOrUndefined(decodeCodeNavRequest(malformed))).toBeUndefined();
    }
  });

  test("accepts complete search and unavailable response variants", () => {
    expect(Option.getOrUndefined(decodeCodeNavResponse(validResponse))).toEqual(validResponse);
    expect(Option.getOrUndefined(decodeCodeNavResponse({
      ...validResponse,
      backend: "unavailable",
      definitions: [],
      references: [],
    }))).toBeDefined();
  });

  test("rejects malformed response envelopes", () => {
    for (const malformed of [
      {},
      { ...validResponse, backend: "rg" },
      { ...validResponse, complete: "yes" },
      { ...validResponse, definitions: [{ ...validResponse.definitions[0], line: "42" }] },
      { ...validResponse, definitions: [{ ...validResponse.definitions[0], snippet: undefined }] },
      { ...validResponse, references: [{ ...validResponse.references[0], confidence: "certain" }] },
      { ...validResponse, stats: { elapsedMs: "12", capped: false } },
      { ...validResponse, stats: { capped: false } },
      { ...validResponse, searchScope: "worktree" },
    ]) {
      expect(Option.getOrUndefined(decodeCodeNavResponse(malformed))).toBeUndefined();
    }
  });

});

// ---------------------------------------------------------------------------
// extractChangedFiles
// ---------------------------------------------------------------------------

describe("extractChangedFiles", () => {
  test("extracts paths from unified diff", () => {
    const patch = `diff --git a/src/server.ts b/src/server.ts
--- a/src/server.ts
+++ b/src/server.ts
@@ -1,3 +1,3 @@
diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts`;

    const result = extractChangedFiles(patch);
    expect(result).toEqual(["src/server.ts", "src/utils.ts"]);
  });

  test("extracts both old and new paths for renames", () => {
    const patch = `diff --git a/src/oldName.ts b/src/newName.ts
similarity index 95%
rename from src/oldName.ts
rename to src/newName.ts`;

    const result = extractChangedFiles(patch);
    expect(result).toContain("src/oldName.ts");
    expect(result).toContain("src/newName.ts");
  });

  test("deduplicates when paths are the same", () => {
    const patch = `diff --git a/src/server.ts b/src/server.ts
--- a/src/server.ts
+++ b/src/server.ts`;

    const result = extractChangedFiles(patch);
    expect(result).toEqual(["src/server.ts"]);
  });

  test("returns empty for null patch", () => {
    expect(extractChangedFiles(null)).toEqual([]);
  });

  test("returns empty for empty string", () => {
    expect(extractChangedFiles("")).toEqual([]);
  });
});
