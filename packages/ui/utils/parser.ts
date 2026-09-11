import {
  Block,
  type Annotation,
  type CodeAnnotation,
  type EditorAnnotation,
  type ImageAttachment,
} from "../types";
import { annotationFeedback } from "@plannotator/shared/feedback-templates";
import { parseChoiceQuestion } from "./choiceAnnotations";

/**
 * Parsed YAML frontmatter as key-value pairs.
 */
export interface Frontmatter {
  [key: string]: string | string[];
}

/**
 * Extract YAML frontmatter from markdown if present.
 * Returns the parsed frontmatter, the remaining markdown, and the 1-based
 * line number where content begins in the original file (so downstream
 * line references stay accurate).
 */
export interface ExtractFrontmatterResult {
  frontmatter: Frontmatter | null;
  content: string;
  contentStartLine: number;
}

export function extractFrontmatter(markdown: string): ExtractFrontmatterResult {
  const trimmed = markdown.trimStart();

  if (!trimmed.startsWith("---")) {
    return { frontmatter: null, content: markdown, contentStartLine: 1 };
  }

  // Find the closing ---
  const endIndex = trimmed.indexOf("\n---", 3);

  if (endIndex === -1) {
    return { frontmatter: null, content: markdown, contentStartLine: 1 };
  }

  // Extract frontmatter content (between the --- delimiters)
  const frontmatterRaw = trimmed.slice(4, endIndex).trim();
  const rawAfterFrontmatter = trimmed.slice(endIndex + 4);
  const afterFrontmatter = rawAfterFrontmatter.trimStart();

  // Compute the 1-based line where content begins in the original file.
  // Account for: leading whitespace trimmed from original, the frontmatter
  // block itself, and any blank lines between closing --- and first content.
  const leadingChars = markdown.length - trimmed.length;
  const consumedInTrimmed = endIndex + 4 + (rawAfterFrontmatter.length - afterFrontmatter.length);
  const consumedTotal = leadingChars + consumedInTrimmed;
  const contentStartLine = (markdown.slice(0, consumedTotal).match(/\n/g) || []).length + 1;

  // Parse simple YAML (key: value pairs)
  const frontmatter: Frontmatter = {};
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of frontmatterRaw.split("\n")) {
    const trimmedLine = line.trim();

    // Array item (- value)
    if (trimmedLine.startsWith("- ") && currentKey) {
      const value = trimmedLine.slice(2).trim();

      if (!currentArray) {
        currentArray = [];
        frontmatter[currentKey] = currentArray;
      }

      currentArray.push(value);
      continue;
    }

    // Key: value pair
    const colonIndex = trimmedLine.indexOf(":");

    if (colonIndex > 0) {
      currentKey = trimmedLine.slice(0, colonIndex).trim();
      const value = trimmedLine.slice(colonIndex + 1).trim();
      currentArray = null;

      if (value) {
        frontmatter[currentKey] = value;
      }
    }
  }

  return { frontmatter, content: afterFrontmatter, contentStartLine };
}

/**
 * Tag names that trigger a raw HTML block per CommonMark §4.6, Type 6.
 * A line starting with `<tag` or `</tag` (where `tag` is in this set) opens
 * an HTML block that continues verbatim until a blank line or EOF.
 *
 * Inline-only tags (`kbd`, `sub`, `sup`, `mark`, etc.) are NOT here — a line
 * that happens to start with one of those still goes through the paragraph
 * path and renders as escaped text, matching prior behavior.
 */
export const HTML_BLOCK_TAGS: ReadonlySet<string> = new Set([
  "details",
  "summary",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "blockquote",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "ul",
  "ol",
  "li",
  "p",
]);

const HTML_BLOCK_OPEN_RE = /^<\/?([a-zA-Z][a-zA-Z0-9]*)(?:\s|>|\/|$)/;

/**
 * A simplified markdown parser that splits content into linear blocks.
 * For a production app, we would use a robust AST walker (remark),
 * but for this demo, we want predictable text-anchoring.
 */
interface MarkdownParserState {
  blocks: Block[];
  buffer: string[];
  currentId: number;
  currentType: Block["type"];
  currentLevel: number;
  bufferStartLine: number;
  lastLineWasBlank: boolean;
}

interface MarkdownLine {
  value: string;
  trimmed: string;
  index: number;
  sourceLine: number;
  previousLineWasBlank: boolean;
}

interface ListItemCheckbox {
  content: string;
  checked: boolean | undefined;
}

const BLOCKQUOTE_MARKER_RE = /^(?:(?:\*|-|\d+\.)\s|#|```|>)/;

const ALERT_KINDS: readonly NonNullable<Block["alertKind"]>[] = [
  "note",
  "tip",
  "warning",
  "caution",
  "important",
];

/** Split markdown into annotation blocks while retaining source-line boundaries. */
export const parseMarkdownToBlocks = (markdown: string): Block[] => {
  const { content: cleanMarkdown, contentStartLine } = extractFrontmatter(markdown);
  const lines = cleanMarkdown.split("\n");

  const state: MarkdownParserState = {
    blocks: [],
    buffer: [],
    currentId: 0,
    currentType: "paragraph",
    currentLevel: 0,
    bufferStartLine: contentStartLine,
    lastLineWasBlank: false,
  };

  for (let index = 0; index < lines.length; index += 1) {
    const parsedLine = createMarkdownLine(lines[index], index, contentStartLine, state);
    const consumedIndex = parseMarkdownLine(state, lines, parsedLine, contentStartLine);

    if (consumedIndex !== null) index = consumedIndex;
  }

  flushMarkdownBuffer(state);

  return state.blocks;
};

function createMarkdownLine(
  value: string,
  index: number,
  contentStartLine: number,
  state: MarkdownParserState,
): MarkdownLine {
  const previousLineWasBlank = state.lastLineWasBlank;
  state.lastLineWasBlank = false;

  return {
    value,
    trimmed: value.trim(),
    index,
    sourceLine: index + contentStartLine,
    previousLineWasBlank,
  };
}

function parseMarkdownLine(
  state: MarkdownParserState,
  lines: readonly string[],
  line: MarkdownLine,
  contentStartLine: number,
): number | null {
  if (parseHeadingBlock(state, line) || parseHorizontalRuleBlock(state, line)) return line.index;

  if (parseListItemBlock(state, line) || parseBlockquoteBlock(state, line)) return line.index;

  const codeBlockEnd = parseCodeBlock(state, lines, line);

  if (codeBlockEnd !== null) return codeBlockEnd;
  const tableBlockEnd = parseTableBlock(state, lines, line);

  if (tableBlockEnd !== null) return tableBlockEnd;
  const directiveBlockEnd = parseDirectiveBlock(state, lines, line);

  if (directiveBlockEnd !== null) return directiveBlockEnd;
  const htmlBlockEnd = parseHtmlBlock(state, lines, line);

  if (htmlBlockEnd !== null) return htmlBlockEnd;

  const blankOrContinuationEnd = parseBlankOrListContinuation(state, lines, line, contentStartLine);

  if (blankOrContinuationEnd !== null) return blankOrContinuationEnd;

  if (state.buffer.length === 0) state.bufferStartLine = line.sourceLine;
  state.buffer.push(line.value);

  return null;
}

function appendBlock(state: MarkdownParserState, block: Omit<Block, "id" | "order">): Block {
  const currentId = state.currentId;
  state.currentId += 1;
  const createdBlock = { ...block, id: `block-${currentId}`, order: state.currentId };
  state.blocks.push(createdBlock);

  return createdBlock;
}

function flushMarkdownBuffer(state: MarkdownParserState): void {
  if (state.buffer.length === 0) return;
  appendBlock(state, {
    type: state.currentType,
    content: state.buffer.join("\n"),
    level: state.currentLevel,
    startLine: state.bufferStartLine,
  });
  state.buffer = [];
}

function parseHeadingBlock(state: MarkdownParserState, line: MarkdownLine): boolean {
  if (!line.trimmed.startsWith("#")) return false;
  flushMarkdownBuffer(state);
  const marker = line.trimmed.match(/^#+/);
  appendBlock(state, {
    type: "heading",
    content: line.trimmed.replace(/^#+\s*/, ""),
    level: marker ? marker[0].length : 1,
    startLine: line.sourceLine,
  });

  return true;
}

function parseHorizontalRuleBlock(state: MarkdownParserState, line: MarkdownLine): boolean {
  if (line.trimmed !== "---" && line.trimmed !== "***") return false;
  flushMarkdownBuffer(state);
  appendBlock(state, { type: "hr", content: "", startLine: line.sourceLine });

  return true;
}

function parseListItemBlock(state: MarkdownParserState, line: MarkdownLine): boolean {
  const listMatch = line.trimmed.match(/^(\*|-|(\d+)\.)\s/);

  if (!listMatch) return false;

  flushMarkdownBuffer(state);
  const leadingWhitespace = line.value.match(/^(\s*)/);
  const indentation = leadingWhitespace ? leadingWhitespace[1] : "";
  const listLevel = Math.floor(indentation.replace(/\t/g, "  ").length / 2);
  const orderedStartText = listMatch[2];

  const orderedStart =
    orderedStartText === undefined ? undefined : Number.parseInt(orderedStartText, 10);

  const checkbox = parseListItemCheckbox(line.trimmed.slice(listMatch[0].length));

  appendBlock(state, {
    type: "list-item",
    content: checkbox.content,
    level: listLevel,
    checked: checkbox.checked,
    ordered: orderedStart === undefined ? undefined : true,
    orderedStart,
    startLine: line.sourceLine,
  });

  return true;
}

function parseListItemCheckbox(content: string): ListItemCheckbox {
  const checkboxMatch = content.match(/^\[([ xX])\]\s*/);

  if (!checkboxMatch) return { content, checked: undefined };

  return {
    content: content.replace(/^\[([ xX])\]\s*/, ""),
    checked: checkboxMatch[1]?.toLowerCase() === "x",
  };
}

function parseBlockquoteBlock(state: MarkdownParserState, line: MarkdownLine): boolean {
  if (!line.trimmed.startsWith(">")) return false;
  flushMarkdownBuffer(state);
  const stripped = line.trimmed.replace(/^>\s*/, "");
  const previousBlock = state.blocks.at(-1);

  if (shouldMergeBlockquote(previousBlock, stripped, line.previousLineWasBlank)) {
    if (previousBlock) {
      previousBlock.content = previousBlock.content
        ? `${previousBlock.content}\n${stripped}`
        : stripped;
    }

    return true;
  }

  const alertKind = parseAlertKind(stripped);
  appendBlock(state, {
    type: "blockquote",
    content: alertKind === undefined ? stripped : "",
    alertKind,
    startLine: line.sourceLine,
  });

  return true;
}

function shouldMergeBlockquote(
  previousBlock: Block | undefined,
  stripped: string,
  previousLineWasBlank: boolean,
): boolean {
  if (previousLineWasBlank || previousBlock?.type !== "blockquote") return false;

  if (previousBlock.alertKind) return true;

  return !BLOCKQUOTE_MARKER_RE.test(stripped) && !BLOCKQUOTE_MARKER_RE.test(previousBlock.content);
}

function parseAlertKind(stripped: string): Block["alertKind"] {
  const alertMatch = stripped.match(/^\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*$/i);
  const candidate = alertMatch?.[1]?.toLowerCase();

  return ALERT_KINDS.find((kind) => kind === candidate);
}

function parseCodeBlock(
  state: MarkdownParserState,
  lines: readonly string[],
  line: MarkdownLine,
): number | null {
  if (!line.trimmed.startsWith("```")) return null;
  flushMarkdownBuffer(state);
  const openingFence = line.trimmed.match(/^`+/);
  const fenceLength = openingFence ? openingFence[0].length : 3;
  const closingFence = new RegExp("^\\s*`{" + fenceLength + ",}");
  const codeLines: string[] = [];
  let index = line.index + 1;

  while (index < lines.length && !closingFence.test(lines[index])) {
    codeLines.push(lines[index]);
    index += 1;
  }

  appendBlock(state, {
    type: "code",
    content: codeLines.join("\n"),
    language: line.trimmed.slice(fenceLength).trim() || undefined,
    startLine: line.sourceLine,
  });

  return index;
}

function parseTableBlock(
  state: MarkdownParserState,
  lines: readonly string[],
  line: MarkdownLine,
): number | null {
  if (!line.trimmed.startsWith("|")) return null;
  flushMarkdownBuffer(state);
  const tableLines = [line.value];
  let index = line.index;

  while (index + 1 < lines.length && lines[index + 1].trim().startsWith("|")) {
    index += 1;
    tableLines.push(lines[index]);
  }

  appendBlock(state, {
    type: "table",
    content: tableLines.join("\n"),
    startLine: line.sourceLine,
  });

  return index;
}

function parseDirectiveBlock(
  state: MarkdownParserState,
  lines: readonly string[],
  line: MarkdownLine,
): number | null {
  const directiveOpen = line.trimmed.match(/^:::\s*([a-zA-Z][a-zA-Z0-9-]*)\s*$/);
  const kind = directiveOpen?.[1];

  if (!kind) return null;

  flushMarkdownBuffer(state);
  const bodyLines: string[] = [];
  let index = line.index;

  while (index + 1 < lines.length) {
    index += 1;

    if (lines[index].trim() === ":::") break;
    bodyLines.push(lines[index]);
  }

  appendBlock(state, {
    type: "directive",
    content: bodyLines.join("\n"),
    directiveKind: kind.toLowerCase(),
    startLine: line.sourceLine,
  });

  return index;
}

function parseHtmlBlock(
  state: MarkdownParserState,
  lines: readonly string[],
  line: MarkdownLine,
): number | null {
  const htmlTagMatch = line.trimmed.match(HTML_BLOCK_OPEN_RE);
  const tagName = htmlTagMatch?.[1]?.toLowerCase();

  if (!tagName || !HTML_BLOCK_TAGS.has(tagName)) return null;

  flushMarkdownBuffer(state);
  const htmlLines = [line.value];

  const endIndex = line.trimmed.startsWith("</")
    ? collectClosingHtmlBlock(lines, line.index, htmlLines)
    : collectBalancedHtmlBlock(lines, line.index, line.value, tagName, htmlLines);

  appendBlock(state, {
    type: "html",
    content: htmlLines.join("\n"),
    startLine: line.sourceLine,
  });

  return endIndex;
}

function collectClosingHtmlBlock(
  lines: readonly string[],
  startIndex: number,
  htmlLines: string[],
): number {
  let index = startIndex;

  while (index + 1 < lines.length && lines[index + 1].trim() !== "") {
    index += 1;
    htmlLines.push(lines[index]);
  }

  return index;
}

function collectBalancedHtmlBlock(
  lines: readonly string[],
  startIndex: number,
  firstLine: string,
  tagName: string,
  htmlLines: string[],
): number {
  const openRe = new RegExp(`<${tagName}(?:\\s|>|/|$)`, "gi");
  const closeRe = new RegExp(`</${tagName}\\s*>`, "gi");
  let depth = countHtmlTags(firstLine, openRe) - countHtmlTags(firstLine, closeRe);
  let index = startIndex;

  while (depth > 0 && index + 1 < lines.length) {
    index += 1;
    const nextLine = lines[index];
    htmlLines.push(nextLine);
    depth += countHtmlTags(nextLine, openRe) - countHtmlTags(nextLine, closeRe);
  }

  return index;
}

function countHtmlTags(line: string, matcher: RegExp): number {
  return (line.match(matcher) || []).length;
}

function parseBlankOrListContinuation(
  state: MarkdownParserState,
  lines: readonly string[],
  line: MarkdownLine,
  contentStartLine: number,
): number | null {
  if (line.trimmed === "") return parseBlankLine(state, lines, line, contentStartLine);
  const previousBlock = state.blocks.at(-1);
  const continuationPattern = line.previousLineWasBlank ? /^\s{2,}/ : /^\s+/;

  if (!previousBlock || state.buffer.length > 0 || previousBlock.type !== "list-item") return null;

  if (!continuationPattern.test(line.value)) return null;

  previousBlock.content += `${line.previousLineWasBlank ? "\n\n" : "\n"}${line.trimmed}`;

  return line.index;
}

function parseBlankLine(
  state: MarkdownParserState,
  lines: readonly string[],
  line: MarkdownLine,
  contentStartLine: number,
): number {
  const candidateStartIndex = state.bufferStartLine - contentStartLine;

  const choice =
    state.buffer.length > 0
      ? parseChoiceQuestion(lines.slice(candidateStartIndex).join("\n"))
      : null;

  if (choice) {
    appendBlock(state, {
      type: "choice-question",
      content: choice.question,
      choiceOptions: choice.options,
      recommendedChoiceLabel: choice.recommendedLabel,
      sourceText: choice.sourceText,
      sourceLineCount: choice.sourceLineCount,
      startLine: state.bufferStartLine,
    });
    state.buffer = [];
    state.currentType = "paragraph";
    state.lastLineWasBlank = false;

    return candidateStartIndex + choice.sourceLineCount - 1;
  }

  flushMarkdownBuffer(state);
  state.currentType = "paragraph";
  state.lastLineWasBlank = true;

  return line.index;
}

/**
 * Compute the display index for each list item in a contiguous list group.
 *
 * Returns a parallel array where each entry is either:
 *   - a positive integer (the numeral to render for an ordered item), or
 *   - null (the item is unordered, render a bullet symbol).
 *
 * Semantics:
 *   - A run of consecutive ordered items at the same level increments
 *     sequentially. The first item in a run uses its `orderedStart` (the
 *     number from the source markdown); subsequent items renumber from there
 *     so `1. / 2. / 5.` renders as 1, 2, 3 (matches CommonMark).
 *   - An unordered item at level L breaks the ordered streak at L. The next
 *     ordered item at L restarts from its own `orderedStart`.
 *   - Visiting a level shallower than the current one truncates deeper-level
 *     state, so re-entering that depth later starts fresh. Top-level numbering
 *     continues across nested children of any kind.
 */
export const computeListIndices = (blocks: Block[]): (number | null)[] => {
  const counters: number[] = [];
  const lastOrderedAtLevel: boolean[] = [];

  return blocks.map((block) => {
    const lvl = block.level || 0;
    // Sibling change at any deeper level resets those levels.
    counters.length = lvl + 1;
    lastOrderedAtLevel.length = lvl + 1;

    if (!block.ordered) {
      lastOrderedAtLevel[lvl] = false;

      return null;
    }

    if (lastOrderedAtLevel[lvl]) {
      counters[lvl] = (counters[lvl] ?? 0) + 1;
    } else {
      counters[lvl] = block.orderedStart ?? 1;
    }

    lastOrderedAtLevel[lvl] = true;

    return counters[lvl];
  });
};

/** Wrap feedback output with annotation instructions for pasting into agent sessions */
export const wrapFeedbackForAgent = (feedback: string): string => annotationFeedback(feedback);

export interface ExportAnnotationsOptions {
  sourceConverted?: boolean;
}

/** Compute the end line of a block from its content and type. */
const blockEndLine = (block: Block): number => {
  if (block.type === "choice-question") {
    const lineCount = block.sourceLineCount ?? block.sourceText?.split("\n").length ?? 1;

    return block.startLine + lineCount - 1;
  }

  if (!block.content) return block.startLine;
  const contentLines = block.content.split("\n").length;

  if (block.type === "code") return block.startLine + contentLines + 1;

  if (block.type === "directive") return block.startLine + contentLines + 1;

  if (block.alertKind) return block.startLine + contentLines;

  return block.startLine + contentLines - 1;
};

/** Resolve the source-line label for a single annotation.
 *  Returns null for global comments, diff-view annotations, or missing blocks. */
const lineLabelForAnnotation = (blocks: Block[], ann: any): string | null => {
  if (!ann.blockId || ann.type === "GLOBAL_COMMENT") return null;

  if (
    Object.prototype.toString.call(ann.blockId) === "[object String]" &&
    ann.blockId.startsWith("diff-block-")
  )
    return null;
  const block = blocks.find((b) => b.id === ann.blockId);

  if (!block || Object.prototype.toString.call(block.startLine) !== "[object Number]") return null;
  const end = blockEndLine(block);

  if (end <= block.startLine) return `line ${block.startLine}`;

  return `lines ${block.startLine}–${end}`;
};

export const exportAnnotations = (
  blocks: Block[],
  annotations: any[],
  globalAttachments: ImageAttachment[] = [],
  title: string = "Plan Feedback",
  subject: string = "plan",
  opts: ExportAnnotationsOptions = {},
): string => {
  if (annotations.length === 0 && globalAttachments.length === 0) {
    return "No changes detected.";
  }

  // Sort annotations by block and offset
  const sortedAnns = [...annotations].sort((a, b) => {
    const blockA = blocks.findIndex((blk) => blk.id === a.blockId);
    const blockB = blocks.findIndex((blk) => blk.id === b.blockId);

    if (blockA !== blockB) return blockA - blockB;

    return a.startOffset - b.startOffset;
  });

  let output = `# ${title}\n\n`;

  if (opts.sourceConverted) {
    output += `> Note: Line numbers below refer to the converted markdown, not the original HTML/URL source.\n\n`;
  }

  // Add global reference images section if any
  if (globalAttachments.length > 0) {
    output += `## Reference Images\n`;
    output += `Please review these reference images (use the Read tool to view):\n`;
    globalAttachments.forEach((img, idx) => {
      output += `${idx + 1}. [${img.name}] \`${img.path}\`\n`;
    });
    output += `\n`;
  }

  if (annotations.length > 0) {
    output += `I've reviewed this ${subject} and have ${annotations.length} piece${annotations.length > 1 ? "s" : ""} of feedback:\n\n`;
  }

  sortedAnns.forEach((ann, index) => {
    output += `## ${index + 1}. `;

    // Add diff context label if annotation was created in diff view
    if (ann.diffContext) {
      output += `[In diff content] `;
    } else {
      const lineLabel = lineLabelForAnnotation(blocks, ann);

      if (lineLabel) output += `(${lineLabel}) `;
    }

    switch (ann.type) {
      case "DELETION":
        output += `Remove this\n`;
        output += `\`\`\`\n${ann.originalText}\n\`\`\`\n`;
        output += `> I don't want this in the ${subject}.\n`;
        break;

      case "COMMENT":
        if (ann.isQuickLabel) {
          output += `[${ann.text}] Feedback on: "${ann.originalText}"\n`;

          if (ann.quickLabelTip) {
            output += `> ${ann.quickLabelTip}\n`;
          }
        } else {
          output += `Feedback on: "${ann.originalText}"\n`;
          output += `> ${ann.text}\n`;
        }

        break;

      case "GLOBAL_COMMENT":
        output += `General feedback about the ${subject}\n`;
        output += `> ${ann.text}\n`;
        break;
    }

    // Add attached images for this annotation
    if (ann.images && ann.images.length > 0) {
      output += `**Attached images:**\n`;
      ann.images.forEach((img: ImageAttachment) => {
        output += `- [${img.name}] \`${img.path}\`\n`;
      });
    }

    output += "\n";
  });

  output += `---\n`;

  // Quick Label Summary
  const labeledAnns = sortedAnns.filter((a: any) => a.isQuickLabel && a.text);

  if (labeledAnns.length > 0) {
    const grouped = new Map<string, number>();
    labeledAnns.forEach((a: any) => {
      grouped.set(a.text, (grouped.get(a.text) || 0) + 1);
    });

    output += `\n## Label Summary\n\n`;

    for (const [text, count] of grouped) {
      output += `- **${text}**: ${count}\n`;
    }

    output += "\n";
  }

  return output;
};

export interface LinkedDocAnnotationEntry {
  annotations: Annotation[];
  globalAttachments: ImageAttachment[];
  markdown?: string;
  blocks?: Block[];
  isConverted?: boolean;
}

export const exportLinkedDocAnnotations = (
  docAnnotations: Map<string, LinkedDocAnnotationEntry>,
): string => {
  let output = `\n# Linked Document Feedback\n\nThe following feedback is on documents referenced in the plan.\n\n`;

  for (const [
    filepath,
    { annotations, globalAttachments, blocks: docBlocks, isConverted },
  ] of docAnnotations) {
    if (annotations.length === 0 && globalAttachments.length === 0) continue;

    output += `## ${filepath}${isConverted ? " (converted from HTML — line numbers refer to converted markdown)" : ""}\n\n`;

    if (globalAttachments.length > 0) {
      output += `### Reference Images\n`;
      output += `Please review these reference images (use the Read tool to view):\n`;
      globalAttachments.forEach((img, idx) => {
        output += `${idx + 1}. [${img.name}] \`${img.path}\`\n`;
      });
      output += `\n`;
    }

    // Sort annotations by block and offset
    const sortedAnns = [...annotations].sort((a, b) => {
      if (a.blockId !== b.blockId) return a.blockId.localeCompare(b.blockId);

      return a.startOffset - b.startOffset;
    });

    output += `I've reviewed this document and have ${annotations.length} piece${annotations.length !== 1 ? "s" : ""} of feedback:\n\n`;

    sortedAnns.forEach((ann, index) => {
      output += `### ${index + 1}. `;

      const lineLabel = docBlocks ? lineLabelForAnnotation(docBlocks, ann) : null;

      if (lineLabel) output += `(${lineLabel}) `;

      switch (ann.type) {
        case "DELETION":
          output += `Remove this\n`;
          output += `\`\`\`\n${ann.originalText}\n\`\`\`\n`;
          output += `> I don't want this in the document.\n`;
          break;

        case "COMMENT":
          if (ann.isQuickLabel) {
            output += `[${ann.text}] Feedback on: "${ann.originalText}"\n`;

            if (ann.quickLabelTip) {
              output += `> ${ann.quickLabelTip}\n`;
            }
          } else {
            output += `Feedback on: "${ann.originalText}"\n`;
            output += `> ${ann.text}\n`;
          }

          break;

        case "GLOBAL_COMMENT":
          output += `General feedback about the document\n`;
          output += `> ${ann.text}\n`;
          break;
      }

      if (ann.images && ann.images.length > 0) {
        output += `**Attached images:**\n`;
        ann.images.forEach((img: ImageAttachment) => {
          output += `- [${img.name}] \`${img.path}\`\n`;
        });
      }

      output += "\n";
    });
  }

  output += `---\n`;

  return output;
};

export const exportEditorAnnotations = (editorAnnotations: EditorAnnotation[]): string => {
  if (editorAnnotations.length === 0) return "";

  let output = `\n# Editor File Annotations\n\nThe following annotations reference code files in the project.\n\n`;

  editorAnnotations.forEach((ann, index) => {
    const lineRange =
      ann.lineStart === ann.lineEnd
        ? `line ${ann.lineStart}`
        : `lines ${ann.lineStart}-${ann.lineEnd}`;

    output += `## ${index + 1}. ${ann.filePath} (${lineRange})\n`;
    output += `\`\`\`\n${ann.selectedText}\n\`\`\`\n`;

    if (ann.comment) {
      output += `> ${ann.comment}\n`;
    }

    output += "\n";
  });

  output += `---\n`;

  return output;
};

export const exportCodeFileAnnotations = (annotations: CodeAnnotation[]): string => {
  if (annotations.length === 0) return "";

  let output = `\n# Code File Feedback\n\nThe following feedback is on code files referenced from the reviewed document.\n\n`;

  const sorted = [...annotations].sort((a, b) => {
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);

    if (a.lineStart !== b.lineStart) return a.lineStart - b.lineStart;

    return a.createdAt - b.createdAt;
  });

  sorted.forEach((ann, index) => {
    const lineRange =
      ann.lineStart === ann.lineEnd
        ? `line ${ann.lineStart}`
        : `lines ${ann.lineStart}-${ann.lineEnd}`;

    output += `## ${index + 1}. ${ann.filePath} (${lineRange})\n`;

    if (ann.originalCode) {
      output += `\`\`\`\n${ann.originalCode}\n\`\`\`\n`;
    }

    if (ann.text) {
      output += `> ${ann.text}\n`;
    }

    if (ann.images && ann.images.length > 0) {
      output += `**Attached images:**\n`;
      ann.images.forEach((img) => {
        output += `- [${img.name}] \`${img.path}\`\n`;
      });
    }

    output += "\n";
  });

  output += `---\n`;

  return output;
};

export interface MessageAnnotationEntry {
  messageId: string;
  text: string;
  timestamp?: string;
  annotations: Annotation[];
  globalAttachments: ImageAttachment[];
  blocks?: Block[];
  linkedDocs?: Map<string, LinkedDocAnnotationEntry>;
  codeAnnotations?: CodeAnnotation[];
}

const MESSAGE_EXCERPT_MAX_CHARS = 1200;

const excerptMessageText = (text: string): string => {
  const trimmed = text.trim();

  if (trimmed.length <= MESSAGE_EXCERPT_MAX_CHARS) return trimmed;

  return `${trimmed.slice(0, MESSAGE_EXCERPT_MAX_CHARS).trimEnd()}...`;
};

const fencedBlock = (text: string, language = ""): string => {
  let fence = "```";

  while (text.includes(fence)) fence += "`";

  return `${fence}${language}\n${text}\n${fence}\n`;
};

export const exportMessageAnnotations = (entries: MessageAnnotationEntry[]): string => {
  const nonEmpty = entries.filter((entry) => {
    const linkedDocCount = entry.linkedDocs
      ? Array.from(entry.linkedDocs.values()).reduce(
          (sum, doc) => sum + doc.annotations.length + doc.globalAttachments.length,
          0,
        )
      : 0;

    return (
      entry.annotations.length > 0 ||
      entry.globalAttachments.length > 0 ||
      (entry.codeAnnotations?.length ?? 0) > 0 ||
      linkedDocCount > 0
    );
  });

  if (nonEmpty.length === 0) {
    return "User reviewed the messages and has no feedback.";
  }

  let output = `# Message Feedback\n\nThe following feedback spans ${nonEmpty.length} assistant message${nonEmpty.length === 1 ? "" : "s"}. Each section includes an excerpt of the message it applies to.\n\n`;

  nonEmpty.forEach((entry, index) => {
    const label = entry.timestamp ? ` (${entry.timestamp})` : "";
    output += `## Message ${index + 1}${label}\n\n`;
    output += `Message excerpt:\n`;
    output += fencedBlock(excerptMessageText(entry.text), "markdown");
    output += "\n";

    if (entry.annotations.length > 0 || entry.globalAttachments.length > 0) {
      output += exportAnnotations(
        entry.blocks ?? parseMarkdownToBlocks(entry.text),
        entry.annotations,
        entry.globalAttachments,
        `Feedback for Message ${index + 1}`,
        "message",
      );
      output += "\n";
    }

    const hasLinkedDocFeedback = entry.linkedDocs
      ? Array.from(entry.linkedDocs.values()).some(
          (doc) => doc.annotations.length > 0 || doc.globalAttachments.length > 0,
        )
      : false;

    if (entry.linkedDocs && hasLinkedDocFeedback) {
      output += exportLinkedDocAnnotations(entry.linkedDocs);
      output += "\n";
    }

    if (entry.codeAnnotations?.length) {
      output += exportCodeFileAnnotations(entry.codeAnnotations);
      output += "\n";
    }
  });

  return output.trimEnd();
};
