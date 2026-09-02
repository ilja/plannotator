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
    if (code && code.getAttribute("data-syntax-state") === "highlighted")
      return code as HTMLElement;
    await new Promise((r) => setTimeout(r, 20));
    await act(async () => {});
  }
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
    const spans = code.querySelectorAll("span");
    const colors = new Set(
      Array.from(spans)
        .map((s) => (s as HTMLElement).style.color)
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
    const code = container.querySelector("code[data-markdown-code-block]") as HTMLElement;
    // Simulate Viewer inserting a mark before highlight completes
    // We need to test with slow highlight – use test layer with delayed effect
    await disposeCodeHighlightingRuntime();
    setCodeHighlightingLayerForTest(null);
    const delayedLayer = makeTestLayer({
      highlightImpl: (input) =>
        Effect.gen(function* () {
          yield* Effect.sleep(100);
          return {
            _tag: "Highlighted" as const,
            lines: [[{ content: input.code, color: "#fff" }]],
          };
        }),
    });
    setCodeHighlightingLayerForTest(delayedLayer);
    const block2 = createBlock({ content: "delayed content", language: "ruby" });
    const container2 = await mountCodeBlock(block2);
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
});
