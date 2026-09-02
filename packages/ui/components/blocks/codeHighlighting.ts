import { Cache, Context, Data, Duration, Effect, Exit, Layer } from "effect";
import { createHighlighter, type Highlighter } from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine-javascript.mjs";
import { framerLightSyntaxTheme } from "../../themes/framerLightSyntax";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FallbackReason =
  | "unlabelled"
  | "unsupported-language"
  | "too-large"
  | "too-large-line"
  | "empty"
  | "provider-error";

export interface Token {
  readonly content: string;
  readonly color?: string;
  readonly fontStyle?: number;
  readonly htmlStyle?: string;
}

export type TokenLine = ReadonlyArray<Token>;

export type HighlightResult =
  | { readonly _tag: "Highlighted"; readonly lines: ReadonlyArray<TokenLine> }
  | { readonly _tag: "PlainText"; readonly reason: FallbackReason };

export interface HighlightInput {
  readonly code: string;
  readonly language: string | undefined;
  readonly themeName: string;
}

interface InternalHighlightKey {
  readonly code: string;
  readonly normalizedLanguage: string;
  readonly themeName: string;
}

// ---------------------------------------------------------------------------
// Language normalization
// ---------------------------------------------------------------------------

const LANGUAGE_ALIASES = {
  rb: "ruby",
  js: "javascript",
  ts: "typescript",
  py: "python",
  yml: "yaml",
  md: "markdown",
  sh: "shell",
  shell: "shell",
  zsh: "shell",
  "c++": "cpp",
} satisfies Record<string, string>;

export function normalizeLanguage(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const firstToken = trimmed.split(/\s+/)[0];
  if (!firstToken) return undefined;
  const lower = firstToken.toLowerCase();
  return LANGUAGE_ALIASES[lower] ?? lower;
}

// ---------------------------------------------------------------------------
// Size policy
// ---------------------------------------------------------------------------

export const MAX_BLOCK_CHARS = 100_000;
export const MAX_LINE_CHARS = 20_000;

export function checkSizeLimits(code: string): FallbackReason | null {
  if (code.length === 0) return "empty";
  if (code.length > MAX_BLOCK_CHARS) return "too-large";
  // Check line length without splitting huge string twice
  let lineStart = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "\n") {
      if (i - lineStart > MAX_LINE_CHARS) return "too-large-line";
      lineStart = i + 1;
    }
  }
  if (code.length - lineStart > MAX_LINE_CHARS) return "too-large-line";
  return null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class HighlightProviderError extends Data.TaggedError("HighlightProviderError")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

export class UnsupportedLanguageError extends Data.TaggedError("UnsupportedLanguageError")<{
  readonly language: string;
}> {}

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

export interface CodeHighlighting {
  readonly highlight: (input: HighlightInput) => Effect.Effect<HighlightResult>;
}

export class CodeHighlightingService extends Context.Service<
  CodeHighlightingService,
  CodeHighlighting
>()("CodeHighlightingService") {}

// ---------------------------------------------------------------------------
// Token mapping
// ---------------------------------------------------------------------------

function mapShikiTokens(
  shikiTokens: ReturnType<Highlighter["codeToTokens"]>,
): ReadonlyArray<TokenLine> {
  return shikiTokens.tokens.map((line) =>
    line.map((tok) => {
      const htmlStyleParts: string[] = [];
      if (tok.color) htmlStyleParts.push(`color:${tok.color}`);
      if (tok.fontStyle) {
        // fontStyle bits: 1 = italic, 2 = bold, 4 = underline (shiki)
        if (tok.fontStyle & 1) htmlStyleParts.push("font-style:italic");
        if (tok.fontStyle & 2) htmlStyleParts.push("font-weight:bold");
        if (tok.fontStyle & 4) htmlStyleParts.push("text-decoration:underline");
      }
      // SAFETY: Token shape matches Shiki's ThemedToken, validated by mapShikiTokens
      return {
        content: tok.content,
        color: tok.color,
        fontStyle: tok.fontStyle,
        htmlStyle: htmlStyleParts.length > 0 ? htmlStyleParts.join(";") : undefined,
      } as Token;
    }),
  );
}

// ---------------------------------------------------------------------------
// Highlighter creation
// ---------------------------------------------------------------------------

const INITIAL_LANGUAGES = [
  "ruby",
  "javascript",
  "typescript",
  "python",
  "yaml",
  "markdown",
  "shell",
  "cpp",
  "json",
] as const;

const INITIAL_THEMES = [
  "github-dark",
  "github-light",
  framerLightSyntaxTheme,
] as const;

function createShikiHighlighter(): Promise<Highlighter> {
  return createHighlighter({
    themes: [...INITIAL_THEMES] as unknown as string[],
    langs: [...INITIAL_LANGUAGES] as unknown as string[],
    engine: createJavaScriptRegexEngine(),
  });
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const CodeHighlightingLive = Layer.effect(
  CodeHighlightingService,
  Effect.gen(function* () {
    // Eager highlighter creation – 20ms, acceptable for annotation startup.
    // If startup budget tightens, wrap with Effect.cached + lazy init.
    const highlighter = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => createShikiHighlighter(),
        catch: (cause) => new HighlightProviderError({ cause, message: String(cause) }),
      }),
      (h) => Effect.sync(() => h.dispose()),
    );

    // Deduplicated in-flight language/theme loads
    const languageLoadCache = new Map<string, Promise<void>>();
    const themeLoadCache = new Map<string, Promise<void>>();

    const ensureLanguage = (lang: string): Promise<void> => {
      if ((highlighter.getLoadedLanguages() as string[]).includes(lang)) {
        return Promise.resolve();
      }
      const existing = languageLoadCache.get(lang);
      if (existing) return existing;
      const p = highlighter
        .loadLanguage(lang as any)
        .then(() => {
          languageLoadCache.delete(lang);
        })
        .catch((e) => {
          languageLoadCache.delete(lang);
          throw e;
        });
      languageLoadCache.set(lang, p);
      return p;
    };

    const ensureTheme = (theme: string): Promise<void> => {
      if ((highlighter.getLoadedThemes() as string[]).includes(theme)) {
        return Promise.resolve();
      }
      const existing = themeLoadCache.get(theme);
      if (existing) return existing;
      const p = highlighter
        .loadTheme(theme as any)
        .then(() => {
          themeLoadCache.delete(theme);
        })
        .catch((e) => {
          themeLoadCache.delete(theme);
          throw e;
        });
      themeLoadCache.set(theme, p);
      return p;
    };

    // Cache with provider inside lookup – deduplicates concurrent identical tokenization
    const cache: Cache.Cache<InternalHighlightKey, HighlightResult> = yield* Cache.makeWith(
      (key: InternalHighlightKey) =>
        Effect.tryPromise({
          try: async () => {
            await ensureLanguage(key.normalizedLanguage);
            await ensureTheme(key.themeName);
            const shikiResult = highlighter.codeToTokens(key.code, {
              lang: key.normalizedLanguage as any,
              theme: key.themeName as any,
            });
            return mapShikiTokens(shikiResult);
          },
          catch: (cause) => {
            const msg = String(cause);
            const lower = msg.toLowerCase();
            if (
              lower.includes("not found") ||
              lower.includes("not included") ||
              lower.includes("unsupported")
            ) {
              return new UnsupportedLanguageError({ language: key.normalizedLanguage });
            }
            return new HighlightProviderError({ cause, message: msg });
          },
        }).pipe(
          Effect.map((lines): HighlightResult => ({
            _tag: "Highlighted",
            lines,
          })),
          Effect.catchTag("UnsupportedLanguageError", () =>
            Effect.succeed({
              _tag: "PlainText",
              reason: "unsupported-language",
            } as const),
          ),
          Effect.catchTag("HighlightProviderError", () =>
            Effect.succeed({
              _tag: "PlainText",
              reason: "provider-error",
            } as const),
          ),
        ),
      {
        capacity: 100,
        timeToLive: (exit) => {
          if (Exit.isSuccess(exit)) {
            const v = exit.value as HighlightResult;
            if (v._tag === "PlainText" && v.reason === "provider-error") {
              return Duration.millis(0);
            }
          }
          if (Exit.isFailure(exit)) {
            // Cache failures briefly then retry
            return Duration.millis(0);
          }
          return Duration.infinity;
        },
      },
    );

    // The public highlight uses the cache but first does pure checks without caching
    const publicHighlight = Effect.fn("CodeHighlighting.highlight")(function* (
      input: HighlightInput,
    ) {
      const sizeReason = checkSizeLimits(input.code);
      if (sizeReason) {
        if (sizeReason === "empty") return { _tag: "PlainText", reason: "empty" } as const;
        return { _tag: "PlainText", reason: sizeReason } as const;
      }
      const normalized = normalizeLanguage(input.language);
      if (!normalized) {
        return { _tag: "PlainText", reason: "unlabelled" } as const;
      }
      const key: InternalHighlightKey = {
        code: input.code,
        normalizedLanguage: normalized,
        themeName: input.themeName,
      };
      return yield* Cache.get(cache, key);
    });

    // Diagnostics: warn once per unsupported language
    const warnedLanguages = new Set<string>();

    return CodeHighlightingService.of({
      highlight: (input) =>
        publicHighlight(input).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              if (
                result._tag === "PlainText" &&
                result.reason === "unsupported-language" &&
                input.language
              ) {
                const n = normalizeLanguage(input.language);
                if (n && !warnedLanguages.has(n)) {
                  warnedLanguages.add(n);
                  if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
                    console.warn(`[codeHighlighting] unsupported language: ${n}`);
                  }
                }
              }
              if (result._tag === "PlainText" && result.reason === "provider-error") {
                if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
                  console.warn(
                    `[codeHighlighting] provider error for lang=${input.language} theme=${input.themeName}`,
                  );
                }
              }
            }),
          ),
        ),
    });
  }),
);

// Test layer with in-memory fake highlighter for deterministic tests
export const makeTestLayer = (opts?: {
  readonly highlightImpl?: (input: HighlightInput) => Effect.Effect<HighlightResult>;
  readonly capacity?: number;
}) =>
  Layer.succeed(
    CodeHighlightingService,
    CodeHighlightingService.of({
      highlight: opts?.highlightImpl
        ? Effect.fn("CodeHighlighting.Test.highlight")(opts.highlightImpl)
        : () => Effect.succeed({ _tag: "PlainText", reason: "provider-error" } as const),
    }),
  );
