import { describe, expect, test } from "bun:test";
import { resolvePinpointTarget } from "./blockTargeting";

const hasDom = process.env.DOM_TESTS === "1";

function makeCodeBlockContainer() {
  const container = document.createElement("div");
  const blockEl = document.createElement("div");
  blockEl.setAttribute("data-block-id", "block-1");
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.setAttribute("data-markdown-code-block", "true");
  code.setAttribute("data-language", "ruby");
  code.textContent = "amount_total_before = order.amount_total";
  pre.appendChild(code);
  blockEl.appendChild(pre);
  container.appendChild(blockEl);
  document.body.appendChild(container);
  return { container, blockEl, codeEl: code };
}

function makeInlineCodeContainer() {
  const container = document.createElement("div");
  const blockEl = document.createElement("div");
  blockEl.setAttribute("data-block-id", "block-2");
  const p = document.createElement("p");
  const code = document.createElement("code");
  code.textContent = "inline";
  p.appendChild(code);
  blockEl.appendChild(p);
  container.appendChild(blockEl);
  document.body.appendChild(container);
  return { container, blockEl, inlineCode: code };
}

describe("blockTargeting", () => {
  test.skipIf(!hasDom)("targets code block from code element", async () => {
    const { container, codeEl } = makeCodeBlockContainer();
    const target = resolvePinpointTarget(codeEl, container);
    expect(target).not.toBeNull();
    expect(target!.isCodeBlock).toBeTrue();
    expect(target!.blockId).toBe("block-1");
    container.remove();
  });

  test.skipIf(!hasDom)("targets code block from nested token span", async () => {
    const { container, codeEl } = makeCodeBlockContainer();
    const span = document.createElement("span");
    span.textContent = "amount_total_before";
    span.style.color = "red";
    codeEl.textContent = "";
    codeEl.appendChild(span);
    const target = resolvePinpointTarget(span, container);
    expect(target).not.toBeNull();
    expect(target!.isCodeBlock).toBeTrue();
    container.remove();
  });

  test.skipIf(!hasDom)("targets code block from pre padding", async () => {
    const { container, blockEl } = makeCodeBlockContainer();
    // SAFETY: pre element is always present in code block container
    const pre = blockEl.querySelector("pre") as HTMLElement;
    const target = resolvePinpointTarget(pre, container);
    expect(target).not.toBeNull();
    expect(target!.isCodeBlock).toBeTrue();
    container.remove();
  });

  test.skipIf(!hasDom)("targets code block from active mark inside code", async () => {
    const { container, codeEl } = makeCodeBlockContainer();
    const mark = document.createElement("mark");
    mark.setAttribute("data-bind-id", "ann-1");
    mark.textContent = codeEl.textContent || "";
    codeEl.textContent = "";
    codeEl.appendChild(mark);
    const target = resolvePinpointTarget(mark, container);
    expect(target).not.toBeNull();
    expect(target!.isCodeBlock).toBeTrue();
    expect(target!.blockId).toBe("block-1");
    container.remove();
  });

  test.skipIf(!hasDom)("inline code remains inline target", async () => {
    const { container, inlineCode } = makeInlineCodeContainer();
    const target = resolvePinpointTarget(inlineCode, container);
    expect(target).not.toBeNull();
    expect(target!.isCodeBlock).toBeFalse();
    expect(target!.label).toContain("inline");
    container.remove();
  });
});
