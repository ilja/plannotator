import { Effect } from "effect";
import { getCodeHighlightingRuntime } from "./codeHighlightingRuntime";
import { CodeHighlightingService, type HighlightResult } from "./codeHighlighting";

/**
 * Imperative DOM helper for code-block annotation lifecycle.
 * Used by Viewer when it must restore highlighting after removing a mark.
 *
 * This is the single imperative boundary that may replace the same subtree
 * that React's CodeBlock also owns. All mutation checks are centralized here.
 */

const generationMap = new WeakMap<HTMLElement, number>();

export type HighlightCodeElementResult =
  | { kind: "highlighted" }
  | { kind: "plain"; reason: string }
  | { kind: "stale" }
  | { kind: "annotated" }
  | { kind: "detached" };

export async function highlightCodeElement(
  element: HTMLElement,
  code: string,
  language: string | undefined,
  themeName: string,
): Promise<HighlightCodeElementResult> {
  const gen = (generationMap.get(element) ?? 0) + 1;
  generationMap.set(element, gen);

  if (!element.isConnected) return { kind: "detached" };
  if (element.querySelector("mark[data-bind-id]")) return { kind: "annotated" };
  // Store expected values to verify staleness after async
  const expectedCode = code;
  const expectedLanguage = language;
  const expectedTheme = themeName;

  const runtime = getCodeHighlightingRuntime();
  let result: HighlightResult;
  try {
    result = await runtime.runPromise(
      Effect.gen(function* () {
        const svc = yield* CodeHighlightingService;
        return yield* svc.highlight({
          code: expectedCode,
          language: expectedLanguage,
          themeName: expectedTheme,
        });
      }),
    );
  } catch {
    // Defect or interruption – treat as stale, not plain
    if (generationMap.get(element) !== gen) return { kind: "stale" };
    if (!element.isConnected) return { kind: "detached" };
    if (element.querySelector("mark[data-bind-id]")) return { kind: "annotated" };
    return { kind: "plain", reason: "provider-error" };
  }

  // Verify still current
  if (generationMap.get(element) !== gen) return { kind: "stale" };
  if (!element.isConnected) return { kind: "detached" };
  if (element.querySelector("mark[data-bind-id]")) return { kind: "annotated" };
  // Verify code/language/theme still match (defensive)
  // We can't check language/theme directly from element without data attributes,
  // but we can at least check textContent hasn't been externally changed to something else
  // – though after removeHighlight we set textContent to plain, so it's expected.

  if (result._tag === "PlainText") {
    // Fallback: ensure plain text is visible
    if (element.textContent !== code) {
      element.textContent = code;
    }
    element.setAttribute("data-syntax-state", "fallback");
    return { kind: "plain", reason: result.reason };
  }

  // Highlighted: replace children with token spans
  // Create DocumentFragment with spans
  const fragment = document.createDocumentFragment();
  result.lines.forEach((line, lineIdx) => {
    line.forEach((token) => {
      const span = document.createElement("span");
      if (token.htmlStyle) {
        span.setAttribute("style", token.htmlStyle);
      } else if (token.color) {
        span.style.color = token.color;
      }
      span.textContent = token.content;
      fragment.appendChild(span);
    });
    if (lineIdx < result.lines.length - 1) {
      fragment.appendChild(document.createTextNode("\n"));
    }
  });

  // Final guard before committing
  if (generationMap.get(element) !== gen) return { kind: "stale" };
  if (!element.isConnected) return { kind: "detached" };
  if (element.querySelector("mark[data-bind-id]")) return { kind: "annotated" };

  element.replaceChildren(fragment);
  element.setAttribute("data-syntax-state", "highlighted");
  return { kind: "highlighted" };
}

export function invalidateCodeHighlight(element: HTMLElement): void {
  const gen = (generationMap.get(element) ?? 0) + 1;
  generationMap.set(element, gen);
}
