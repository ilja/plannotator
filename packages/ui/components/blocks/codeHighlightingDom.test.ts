import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { highlightCodeElement, invalidateCodeHighlight } from "./codeHighlightingDom";
import { makeTestLayer } from "./codeHighlighting";
import {
  disposeCodeHighlightingRuntime,
  setCodeHighlightingLayerForTest,
} from "./codeHighlightingRuntime";

const hasDom = process.env.DOM_TESTS === "1";

describe("codeHighlightingDom", () => {
  test.skipIf(!hasDom)("repeated highlight calls respect generation", async () => {
    const layer = makeTestLayer({
      highlightImpl: (input) =>
        Effect.succeed({
          _tag: "Highlighted",
          lines: [[{ content: input.code, color: "#fff" }]],
        } as const),
    });

    setCodeHighlightingLayerForTest(layer);
    const el = document.createElement("code");
    el.setAttribute("data-markdown-code-block", "true");
    el.textContent = "a = 1";
    document.body.appendChild(el);

    const p1 = highlightCodeElement(el, "a = 1", "ruby", "github-dark");
    // Immediately invalidate and start second
    invalidateCodeHighlight(el);
    const p2 = highlightCodeElement(el, "b = 2", "ruby", "github-dark");
    const r2 = await p2;
    // First should be stale or not commit, second should highlight
    expect(r2.kind).toBe("highlighted");
    expect(el.textContent).toBe("b = 2");
    // p1 may be stale or plain, but should not have overwritten second
    const r1 = await p1;
    expect(r1.kind === "stale" || r1.kind === "highlighted" || r1.kind === "plain").toBeTrue();
    expect(el.textContent).toBe("b = 2");

    el.remove();
    await disposeCodeHighlightingRuntime();
    setCodeHighlightingLayerForTest(null);
  });

  test.skipIf(!hasDom)("detached element returns detached", async () => {
    const layer = makeTestLayer();
    setCodeHighlightingLayerForTest(layer);
    const el = document.createElement("code");
    el.textContent = "hello";
    // Not attached to DOM
    const res = await highlightCodeElement(el, "hello", "ruby", "github-dark");
    expect(res.kind).toBe("detached");
    el.remove();
    await disposeCodeHighlightingRuntime();
    setCodeHighlightingLayerForTest(null);
  });

  test.skipIf(!hasDom)("annotated element returns annotated", async () => {
    const layer = makeTestLayer({
      highlightImpl: (input) =>
        Effect.succeed({
          _tag: "Highlighted",
          lines: [[{ content: input.code, color: "#fff" }]],
        } as const),
    });

    setCodeHighlightingLayerForTest(layer);
    const el = document.createElement("code");
    el.setAttribute("data-markdown-code-block", "true");
    el.textContent = "hello";
    document.body.appendChild(el);
    const mark = document.createElement("mark");
    mark.setAttribute("data-bind-id", "ann-1");
    mark.textContent = "hello";
    el.replaceChildren(mark);
    const res = await highlightCodeElement(el, "hello", "ruby", "github-dark");
    expect(res.kind).toBe("annotated");
    expect(el.querySelector("mark[data-bind-id='ann-1']")).not.toBeNull();
    el.remove();
    await disposeCodeHighlightingRuntime();
    setCodeHighlightingLayerForTest(null);
  });
});
