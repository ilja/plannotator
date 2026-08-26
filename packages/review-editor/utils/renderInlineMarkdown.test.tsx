import { describe, it, expect } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderInlineMarkdown } from "./renderInlineMarkdown";

type MarkdownElement = ReactElement<{ children?: ReactNode }>;

const isElement = (node: ReactNode): node is MarkdownElement =>
  isValidElement<{ children?: ReactNode }>(node);

const types = (nodes: ReactNode[]): string[] =>
  nodes.map((node) => (isElement(node) ? String(node.type) : "string"));

describe("renderInlineMarkdown", () => {
  it("renders underscore emphasis", () => {
    const nodes = renderInlineMarkdown("_text_");
    const emphasized = nodes.find(isElement);
    expect(nodes).toHaveLength(1);
    expect(isElement(nodes[0])).toBe(true);
    expect(emphasized?.type).toBe("em");
    expect(emphasized?.props.children).toBe("text");
  });

  it("renders underscore emphasis in context", () => {
    const nodes = renderInlineMarkdown("foo _bar_ baz");
    expect(nodes.filter(isElement)).toHaveLength(1);
    expect(types(nodes)).toContain("em");
    expect(nodes.find(isElement)?.props.children).toBe("bar");
    expect(nodes.filter((node) => !isElement(node)).join("")).toBe("foo  baz");
  });

  it("keeps intraword underscores literal", () => {
    expect(renderInlineMarkdown("snake_case")).toEqual(["snake_case"]);
    expect(renderInlineMarkdown("foo_bar_baz")).toEqual(["foo_bar_baz"]);
    expect(renderInlineMarkdown("__init__")).toEqual(["__init__"]);
  });

  it("renders underscore emphasis after other inline tokens", () => {
    const boldNodes = renderInlineMarkdown("**bold**_italic_");
    expect(types(boldNodes)).toEqual(["strong", "em"]);
    expect(boldNodes.filter(isElement)[1]?.props.children).toBe("italic");

    const codeNodes = renderInlineMarkdown("`code`_italic_");
    expect(types(codeNodes)).toEqual(["code", "em"]);
    expect(codeNodes.filter(isElement)[1]?.props.children).toBe("italic");

    const linkNodes = renderInlineMarkdown("[link](https://example.com)_italic_");
    expect(types(linkNodes)).toEqual(["a", "em"]);
    expect(linkNodes.filter(isElement)[1]?.props.children).toBe("italic");
  });
});
