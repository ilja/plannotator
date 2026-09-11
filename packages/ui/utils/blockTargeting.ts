/**
 * Block Targeting — resolves which element to annotate in pinpoint mode.
 *
 * Walks from the element under the cursor upward through the block tree
 * to find the most specific targetable element (inline, cell, or block).
 */

/** Elements that should never be targeted */
const SKIP_SELECTORS = [
  ".annotation-toolbar",
  ".annotation-highlight",
  "mark[data-bind-id]",
  "button",
  "[data-pinpoint-ignore]",
].join(",");

/** Inline elements that are individually targetable within a block */
const INLINE_TARGETS = new Set(["STRONG", "EM", "A"]);

/** Table cell elements */
const CELL_TARGETS = new Set(["TD", "TH"]);

export interface PinpointTarget {
  /** The DOM element to highlight and select */
  element: HTMLElement;
  /** The data-block-id of the parent block */
  blockId: string;
  /** Human-readable label for the hover tooltip */
  label: string;
  /** Whether this is a code block (needs special annotation path) */
  isCodeBlock: boolean;
}

/** Edge-zone threshold for table hover (px). Covers the outermost cell padding
 *  area (cells have px-3/py-2 = 12px/8px padding) so you need to aim at actual
 *  text content to target a specific cell. */
const TABLE_EDGE_ZONE = 22;

/**
 * Given a mousemove/click target element, find the best annotation target
 * within the viewer container. Optionally accepts mouse coordinates for
 * edge-zone detection (tables).
 */
export function resolvePinpointTarget(
  target: HTMLElement,
  container: HTMLElement,
  mousePos?: { clientX: number; clientY: number },
): PinpointTarget | null {
  if (!container.contains(target)) return null;

  // Special-case marks inside fenced code blocks: they should still target the code block
  const markInsideCode = target.closest("mark[data-bind-id]");

  if (markInsideCode) {
    const codeEl = markInsideCode.closest("code[data-markdown-code-block]");

    if (codeEl && container.contains(codeEl)) {
      // SAFETY: closest returned Element inside code selector is HTMLElement
      const blockEl = closestHTMLElement(codeEl as HTMLElement, "[data-block-id]");
      const blockId = blockEl?.getAttribute("data-block-id");

      if (blockEl && blockId) {
        return {
          element: blockEl,
          blockId,
          label: getCodeBlockLabel(blockEl),
          isCodeBlock: true,
        };
      }
    }
  }

  if (target.closest(SKIP_SELECTORS)) return null;

  const groupTarget = resolveGroupTarget(target, container);

  if (groupTarget) return groupTarget;

  const blockEl = closestHTMLElement(target, "[data-block-id]");
  const blockId = blockEl?.getAttribute("data-block-id");

  if (!blockEl || blockId === null || !container.contains(blockEl) || blockEl.tagName === "HR") {
    return null;
  }

  const resolvedTarget =
    resolveCodeBlockTarget(target, blockEl, blockId) ??
    resolveTableEdgeTarget(blockEl, blockId, mousePos) ??
    resolveInlineTarget(target, blockId) ??
    resolveTableCellTarget(target, blockEl, blockId) ??
    resolveListItemTarget(blockEl, blockId);

  return (
    resolvedTarget ?? {
      element: blockEl,
      blockId,
      label: getBlockLabel(blockEl),
      isCodeBlock: false,
    }
  );
}

function closestHTMLElement(element: HTMLElement, selector: string): HTMLElement | null {
  const closest = element.closest(selector);

  return closest instanceof HTMLElement ? closest : null;
}

function resolveGroupTarget(target: HTMLElement, container: HTMLElement): PinpointTarget | null {
  const groupEl = closestHTMLElement(target, "[data-pinpoint-group]");

  if (!groupEl || !container.contains(groupEl) || target.closest("[data-block-id]")) return null;

  const groupType = groupEl.getAttribute("data-pinpoint-group");

  const label =
    groupType === "list" ? "list" : groupType === "blockquote" ? "blockquote group" : "group";

  return { element: groupEl, blockId: "", label, isCodeBlock: false };
}

function resolveCodeBlockTarget(
  target: HTMLElement,
  blockEl: HTMLElement,
  blockId: string,
): PinpointTarget | null {
  const codeEl = blockEl.querySelector("code[data-markdown-code-block]");

  if (!codeEl) return null;

  const isInsideCode =
    target === codeEl ||
    codeEl.contains(target) ||
    !!target.closest("code[data-markdown-code-block]") ||
    !!target.closest("pre");

  // Also handle annotation mark inside code
  const isMarkInsideCode = target.matches("mark[data-bind-id]") && codeEl.contains(target);

  if (!isInsideCode && !isMarkInsideCode) return null;

  return { element: blockEl, blockId, label: getCodeBlockLabel(blockEl), isCodeBlock: true };
}

function resolveTableEdgeTarget(
  blockEl: HTMLElement,
  blockId: string,
  mousePos: { clientX: number; clientY: number } | undefined,
): PinpointTarget | null {
  const tableEl = blockEl.querySelector("table");

  if (!tableEl || !mousePos) return null;

  const tableRect = tableEl.getBoundingClientRect();

  const nearHorizontalEdge =
    mousePos.clientX - tableRect.left < TABLE_EDGE_ZONE ||
    tableRect.right - mousePos.clientX < TABLE_EDGE_ZONE;

  const nearVerticalEdge =
    mousePos.clientY - tableRect.top < TABLE_EDGE_ZONE ||
    tableRect.bottom - mousePos.clientY < TABLE_EDGE_ZONE;

  if (nearVerticalEdge) return { element: blockEl, blockId, label: "table", isCodeBlock: false };

  if (!nearHorizontalEdge) return null;

  const row = findRowAtY(tableEl, mousePos.clientY);

  return row
    ? { element: row, blockId, label: getRowLabel(row), isCodeBlock: false }
    : { element: blockEl, blockId, label: "table", isCodeBlock: false };
}

function resolveInlineTarget(target: HTMLElement, blockId: string): PinpointTarget | null {
  if (
    target.tagName === "CODE" &&
    !target.hasAttribute("data-markdown-code-block") &&
    !target.closest("pre")
  ) {
    const text = target.textContent?.trim() || "";

    if (!text) return null;

    return {
      element: target,
      blockId,
      label: `code: \`${truncate(text, 30)}\``,
      isCodeBlock: false,
    };
  }

  if (!INLINE_TARGETS.has(target.tagName)) return null;
  const text = target.textContent?.trim() || "";

  if (!text) return null;

  return { element: target, blockId, label: getInlineLabel(target, text), isCodeBlock: false };
}

function resolveTableCellTarget(
  target: HTMLElement,
  blockEl: HTMLElement,
  blockId: string,
): PinpointTarget | null {
  const cell = CELL_TARGETS.has(target.tagName) ? target : closestHTMLElement(target, "td, th");

  if (!cell || !blockEl.contains(cell)) return null;

  return { element: cell, blockId, label: "table cell", isCodeBlock: false };
}

function resolveListItemTarget(blockEl: HTMLElement, blockId: string): PinpointTarget | null {
  if (!blockEl.querySelector(".select-none")) return null;
  const contentSpan = blockEl.children.item(1);

  if (!(contentSpan instanceof HTMLElement)) return null;

  return {
    element: contentSpan,
    blockId,
    label: getListItemLabel(contentSpan),
    isCodeBlock: false,
  };
}

function getInlineLabel(el: HTMLElement, text: string): string {
  switch (el.tagName) {
    case "STRONG":
      return `bold: "${truncate(text, 30)}"`;
    case "EM":
      return `italic: "${truncate(text, 30)}"`;
    case "A":
      return `link: "${truncate(text, 25)}"`;
    default:
      return truncate(text, 30);
  }
}

function getBlockLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const text = el.textContent?.trim() || "";

  if (el.querySelector("table")) return "table";

  if (el.dataset.blockType === "heading" || /^h[1-6]$/.test(tag)) {
    return `heading: "${truncate(text, 35)}"`;
  }

  if (tag === "blockquote") return `blockquote: "${truncate(text, 30)}"`;

  if (tag === "p") return text ? `paragraph: "${truncate(text, 35)}"` : "paragraph";

  return truncate(text, 35) || tag;
}

function getListItemLabel(contentSpan: HTMLElement): string {
  const text = contentSpan.textContent?.trim() || "";

  return text ? `list item: "${truncate(text, 30)}"` : "list item";
}

function getCodeBlockLabel(blockEl: HTMLElement): string {
  const codeEl = blockEl.querySelector("code[data-markdown-code-block]");

  const lang =
    codeEl?.getAttribute("data-language") || codeEl?.className?.match(/language-(\S+)/)?.[1];

  return lang ? `code block (${lang})` : "code block";
}

/** Find the table row whose bounding box contains the given Y coordinate */
function findRowAtY(tableEl: HTMLTableElement, clientY: number): HTMLTableRowElement | null {
  const rows = tableEl.querySelectorAll("tr");

  for (const row of rows) {
    const rect = row.getBoundingClientRect();

    if (clientY >= rect.top && clientY <= rect.bottom) {
      return row;
    }
  }

  return null;
}

/** Human-readable label for a table row */
function getRowLabel(row: HTMLTableRowElement): string {
  // Header row
  if (row.querySelector("th")) return "table header row";
  // Body row — use first cell text as hint
  const firstCell = row.querySelector("td");
  const text = firstCell?.textContent?.trim() || "";

  return text ? `row: "${truncate(text, 25)}"` : "table row";
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}
