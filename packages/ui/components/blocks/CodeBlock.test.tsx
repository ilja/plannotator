import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "../ThemeProvider";
import { CodeBlock } from "./CodeBlock";
import type { Block } from "../../types";
import {
  disposeCodeHighlightingRuntime,
  setCodeHighlightingLayerForTest,
} from "./codeHighlightingRuntime";
import { makeTestLayer } from "./codeHighlighting";
import { Effect } from "effect";

const hasDom = process.env.DOM_TESTS === "1";

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

const motivatingFragment = `amount_total_before = order.amount_total

save_order_line(order_line)
  .and_then { |value| apply_invoice_correction_after_commit(transaction, value) }`;

function createBlock(overrides: Partial<Block> = {}): Block {
  // SAFETY: overrides are Partial<Block> with same shape — spreads produce valid Block
  return {
    id: "block-1",
    order: 1,
    type: "code",
    content: motivatingFragment,
    language: "ruby",
    startLine: 1,
    ...overrides,
  } as Block;
}

async function mountCodeBlock(
  block: Block,
  theme: string = "plannotator",
  mode: "dark" | "light" = "dark",
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);
  await act(async () => {
    root.render(
      <ThemeProvider
        defaultTheme={mode}
        defaultColorTheme={theme}
        storageKey={`test-${Date.now()}`}
        colorThemeStorageKey={`test-color-${Date.now()}`}
      >
        <CodeBlock block={block} onHover={() => {}} onLeave={() => {}} isHovered={false} />
      </ThemeProvider>,
    );
  });
  // allow initial render
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return container;
}

async function waitForHighlight(container: HTMLDivElement, timeout = 500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const code = container.querySelector("code[data-markdown-code-block]");
    if (code && code.getAttribute("data-syntax-state") === "highlighted") {
      // SAFETY: querySelector with code selector returns HTMLElement
      return code as HTMLElement;
    }
    await new Promise((r) => setTimeout(r, 20));
    await act(async () => {});
  }
  // SAFETY: code block always rendered by CodeBlock
  return container.querySelector("code[data-markdown-code-block]") as HTMLElement;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  for (const c of containers.splice(0)) c.remove();
  document.body.innerHTML = "";
  await disposeCodeHighlightingRuntime();
  setCodeHighlightingLayerForTest(null);
});

describe("CodeBlock", () => {
  test.skipIf(!hasDom)("renders plain text immediately before highlight", async () => {
    const block = createBlock();
    const container = await mountCodeBlock(block);
    // SAFETY: code element always present after mount
    const code = container.querySelector("code[data-markdown-code-block]") as HTMLElement;
    expect(code).not.toBeNull();
    expect(code.textContent).toBe(block.content);
    // Initially either plain or loading, but text must be exact
    expect(code.textContent).toBe(motivatingFragment);
  });

  test.skipIf(!hasDom)("highlights Ruby with distinct token colors", async () => {
    const block = createBlock();
    const container = await mountCodeBlock(block);
    const code = await waitForHighlight(container);
    expect(code.getAttribute("data-syntax-state")).toBe("highlighted");
    // Check multiple distinct colors
    const spans = code.querySelectorAll<HTMLElement>("span");
    const colors = new Set(
      Array.from(spans)
        .map((s) => s.style.color)
        .filter(Boolean),
    );
    // Shiki should produce at least 3 distinct colors for this fragment
    expect(colors.size).toBeGreaterThanOrEqual(3);
    expect(code.textContent).toBe(motivatingFragment);
  });

  test.skipIf(!hasDom)("preserves exact textContent after highlighting", async () => {
    const block = createBlock();
    const container = await mountCodeBlock(block);
    const code = await waitForHighlight(container);
    expect(code.textContent).toBe(block.content);
    // Also check that hostile source remains literal
    const hostile = `<img src=x onerror=alert(1)>`;
    const hostileBlock = createBlock({ content: hostile, language: "ruby" });
    const container2 = await mountCodeBlock(hostileBlock);
    const code2 = await waitForHighlight(container2);
    expect(code2.textContent).toBe(hostile);
    expect(code2.innerHTML).not.toContain("<img");
  });

  test.skipIf(!hasDom)("falls back for unknown language", async () => {
    const block = createBlock({ language: "unknownlang123" });
    const container = await mountCodeBlock(block);
    // Wait a bit for fallback
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    // SAFETY: code element always present after mount
    const code = container.querySelector("code[data-markdown-code-block]") as HTMLElement;
    expect(code.getAttribute("data-syntax-state")).toBe("fallback");
    expect(code.textContent).toBe(block.content);
    expect(code.querySelectorAll("span").length).toBe(0);
  });

  test.skipIf(!hasDom)("falls back for unlabelled fence", async () => {
    const block = createBlock({ language: undefined });
    const container = await mountCodeBlock(block);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // SAFETY: code element always present after mount
    const code = container.querySelector("code[data-markdown-code-block]") as HTMLElement;
    expect(code.getAttribute("data-syntax-state")).toBe("fallback");
    expect(code.textContent).toBe(block.content);
  });

  test.skipIf(!hasDom)("rb alias equivalent to ruby", async () => {
    const rubyBlock = createBlock({ language: "ruby" });
    const rbBlock = createBlock({ language: "rb" });
    const container1 = await mountCodeBlock(rubyBlock);
    const code1 = await waitForHighlight(container1);
    const spans1 = code1.querySelectorAll("span").length;
    // cleanup first
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    for (const c of containers.splice(0)) c.remove();
    await disposeCodeHighlightingRuntime();
    setCodeHighlightingLayerForTest(null);

    const container2 = await mountCodeBlock(rbBlock);
    const code2 = await waitForHighlight(container2);
    const spans2 = code2.querySelectorAll("span").length;
    expect(spans1).toBe(spans2);
    expect(code1.textContent).toBe(code2.textContent);
  });

  test.skipIf(!hasDom)("copy preserves exact source", async () => {
    let copied = "";
    // SAFETY: test harness mocks navigator.clipboard — any required for narrow
    const originalClipboard = (navigator as any).clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (t: string) => {
          copied = t;
        },
      },
      configurable: true,
    });
    const block = createBlock();
    const container = await mountCodeBlock(block);
    await waitForHighlight(container);
    // SAFETY: copy button always rendered
    const btn = container.querySelector("button") as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    expect(copied).toBe(block.content);
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });

  test.skipIf(!hasDom)("does not overwrite annotation mark", async () => {
    const block = createBlock();
    const container = await mountCodeBlock(block);
    // SAFETY: code element present; unused variable silenced
    const _code = container.querySelector("code[data-markdown-code-block]") as HTMLElement;
    void _code;
    // Simulate Viewer inserting a mark before highlight completes
    // We need to test with slow highlight – use test layer with delayed effect
    await disposeCodeHighlightingRuntime();
    setCodeHighlightingLayerForTest(null);
    const delayedLayer = makeTestLayer({
      highlightImpl: (input) =>
        Effect.gen(function* () {
          yield* Effect.sleep(100);
          return {
            // SAFETY: HighlightResult literal
            _tag: "Highlighted" as const,
            lines: [[{ content: input.code, color: "#fff" }]],
          };
        }),
    });
    setCodeHighlightingLayerForTest(delayedLayer);
    const block2 = createBlock({ content: "delayed content", language: "ruby" });
    const container2 = await mountCodeBlock(block2);
    // SAFETY: code element always present after mount
    const code2 = container2.querySelector("code[data-markdown-code-block]") as HTMLElement;
    // Insert mark immediately
    const mark = document.createElement("mark");
    mark.dataset.bindId = "test-id";
    mark.textContent = block2.content;
    code2.innerHTML = "";
    code2.appendChild(mark);
    // Wait for highlight to try to commit
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    // Mark should still be there, not overwritten
    expect(code2.querySelector("mark[data-bind-id='test-id']")).not.toBeNull();
    expect(code2.textContent).toBe(block2.content);
    await disposeCodeHighlightingRuntime();
    setCodeHighlightingLayerForTest(null);
  });

  test.skipIf(!hasDom)("theme change while annotated preserves mark", async () => {
    const block = createBlock();
    const container = await mountCodeBlock(block);
    const code = await waitForHighlight(container);
    expect(code.getAttribute("data-syntax-state")).toBe("highlighted");
    // Simulate Viewer inserting annotation
    const mark = document.createElement("mark");
    mark.dataset.bindId = "ann-1";
    mark.textContent = code.textContent || "";
    code.replaceChildren(mark);
    expect(code.querySelector("mark[data-bind-id='ann-1']")).not.toBeNull();
    // Re-render CodeBlock with new theme (simulates ThemeProvider change)
    // The CodeBlock effect should not overwrite the mark
    const blockSame = createBlock({ content: block.content, language: block.language });
    // Trigger highlight with new theme via direct helper — should return annotated
    const { highlightCodeElement } = await import("./codeHighlightingDom");
    const result = await highlightCodeElement(code, blockSame.content, blockSame.language, "github-light");
    expect(result.kind).toBe("annotated");
    expect(code.querySelector("mark[data-bind-id='ann-1']")).not.toBeNull();
  });

  test.skipIf(!hasDom)("content change while annotated keeps mark, after removal highlights new content", async () => {
    const block = createBlock({ content: "a = 1", language: "ruby" });
    const container = await mountCodeBlock(block);
    const code = await waitForHighlight(container);
    const mark = document.createElement("mark");
    mark.dataset.bindId = "ann-2";
    mark.textContent = code.textContent || "";
    code.replaceChildren(mark);
    // Simulate block content update while annotated — CodeBlock's layout effect would try to set textContent but should keep mark
    // Direct helper should still report annotated
    const { highlightCodeElement } = await import("./codeHighlightingDom");
    const res1 = await highlightCodeElement(code, "b = 2", "ruby", "github-dark");
    expect(res1.kind).toBe("annotated");
    // Remove mark and re-highlight new content
    mark.remove();
    code.textContent = "b = 2";
    const res2 = await highlightCodeElement(code, "b = 2", "ruby", "github-dark");
    expect(res2.kind).toBe("highlighted");
    expect(code.textContent).toBe("b = 2");
    expect(code.getAttribute("data-syntax-state")).toBe("highlighted");
  });

  test.skipIf(!hasDom)("direct-edit remount highlights new content", async () => {
    // Simulate React remount via new block id (direct edit creates new Block)
    const block1 = createBlock({ id: "block-1", content: "x = 1", language: "ruby" });
    const container1 = await mountCodeBlock(block1);
    const code1 = await waitForHighlight(container1);
    expect(code1.textContent).toBe("x = 1");
    // Cleanup first mount
    for (const root of roots.splice(0)) await act(async () => root.unmount());
    for (const c of containers.splice(0)) c.remove();
    await disposeCodeHighlightingRuntime();
    setCodeHighlightingLayerForTest(null);

    const block2 = createBlock({ id: "block-2", content: "y = 2", language: "ruby" });
    const container2 = await mountCodeBlock(block2);
    const code2 = await waitForHighlight(container2);
    expect(code2.textContent).toBe("y = 2");
    expect(code2.getAttribute("data-syntax-state")).toBe("highlighted");
  });
});
