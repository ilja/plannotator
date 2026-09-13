import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import hljs from "highlight.js";
import {
  isCodeFilePath,
  isCodeFilePathStrict,
  CODE_PATH_BARE_REGEX,
  parseCodePath,
} from "@plannotator/shared/code-file";
import { transformPlainText } from "../utils/inlineTransforms";
import { getImageSrc } from "./ImageThumbnail";
import {
  useCodePathValidation,
  type CodePathValidationContextValue,
} from "./CodePathValidationContext";
import { CodeFilePicker } from "./CodeFilePicker";
import { decodeCodeFileSuccessResponse } from "../hooks/codeFileResponse";

const inlineCodeTypographyStyle: React.CSSProperties = {
  fontFamily: "var(--annotation-code-font-family, var(--font-mono))",
  fontSize: "var(--annotation-code-font-size, 0.875em)",
};

/**
 * Decide how a candidate code-file path should render based on validation state:
 *   - 'link'           → clickable, opens directly via onOpenCodeFile(resolvedOrInput)
 *   - 'ambiguous-link' → clickable, opens a picker over `matches`
 *   - 'plain'          → not a link (file does not exist anywhere in the repo)
 *
 * No provider or `ready: false` falls back to optimistic 'link' behavior.
 */
function gateCodePath(
  candidate: string,
  validation: CodePathValidationContextValue | null,
):
  | { render: "link"; resolved?: string }
  | { render: "ambiguous-link"; matches: string[] }
  | { render: "plain" } {
  if (!validation || validation.status !== "ready") return { render: "link" };
  const entry = validation.validated.get(candidate);

  // If the validator is ready but has no entry for this candidate, the
  // extractor intentionally excluded it (e.g., inside an HTML comment or
  // fenced code block). Demote rather than optimistically linking.
  if (!entry) return { render: "plain" };

  switch (entry.status) {
    case "found":
      return { render: "link", resolved: entry.resolved };
    case "ambiguous":
      return { render: "ambiguous-link", matches: entry.matches };
    case "unavailable":
      return { render: "link" };
    case "missing":
      return { render: "plain" };
    default:
      return { render: "link" }; // unknown status — degrade to optimistic
  }
}

interface LanguageMap {
  [key: string]: string;
}

function extToLanguage(filepath: string): string | undefined {
  const ext = filepath.split(".").pop()?.toLowerCase();

  const map: LanguageMap = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    css: "css",
    scss: "scss",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    md: "markdown",
    html: "html",
    xml: "xml",
    toml: "toml",
    swift: "swift",
    kt: "kotlin",
  };

  return ext ? map[ext] : undefined;
}

const CodeSnippetPreview: React.FC<{
  anchorEl: HTMLElement | null;
  contents: string;
  filepath: string;
  line: number;
  lineEnd?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}> = ({ anchorEl, contents, filepath, line, lineEnd, onMouseEnter, onMouseLeave }) => {
  const allLines = contents.split("\n");
  const start = Math.max(0, line - 1);
  const end = Math.min(allLines.length, lineEnd ?? line);
  const snippet = allLines.slice(start, end).join("\n");

  const highlightedLines = useMemo(() => {
    const lang = extToLanguage(filepath);
    const lines = snippet.split("\n");

    return lines.map((line) => {
      try {
        if (lang) return hljs.highlight(line, { language: lang }).value;

        return hljs.highlightAuto(line).value;
      } catch {
        return line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
    });
  }, [snippet, filepath]);

  if (!anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const showAbove = spaceBelow < 200 && rect.top > spaceBelow;
  const top = showAbove ? undefined : rect.bottom + 4;
  const bottom = showAbove ? window.innerHeight - rect.top + 4 : undefined;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 520));

  return createPortal(
    <div
      className="fixed z-[9999] rounded-lg border border-border bg-card shadow-xl flex flex-col"
      style={{ top, bottom, left, maxWidth: "min(600px, 90vw)", maxHeight: "300px" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="px-3 py-1.5 border-b border-border/50 text-[10px] text-muted-foreground font-mono flex items-center justify-between gap-4 flex-shrink-0">
        <span>{filepath.split("/").pop()}</span>
        <span className="opacity-60">
          {lineEnd && lineEnd !== line ? `lines ${line}–${lineEnd}` : `line ${line}`}
        </span>
      </div>
      <div
        className="hljs code-snippet-preview overflow-auto text-[12px] leading-5 min-h-0"
        style={{ padding: 0, background: "var(--code-bg, #1e293b)" }}
      >
        <table className="border-collapse w-full">
          <tbody>
            {snippet.split("\n").map((_, i) => (
              <tr key={start + i} className="hover:bg-white/5">
                <td
                  className="select-none text-muted-foreground/40 text-right pr-3 pl-3 py-0 align-top font-mono w-8 whitespace-nowrap"
                  style={{ userSelect: "none" }}
                >
                  {start + i + 1}
                </td>
                <td
                  className="font-mono pr-3 py-0 whitespace-pre"
                  dangerouslySetInnerHTML={{ __html: highlightedLines[i] ?? "" }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  );
};

const CodeFileLink: React.FC<{
  candidate: string;
  display: string;
  onOpenCodeFile: (path: string) => void;
  baseDir?: string;
}> = ({ candidate, display, onOpenCodeFile, baseDir }) => {
  const validation = useCodePathValidation();
  const gate = gateCodePath(candidate, validation);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [hoverPreview, setHoverPreview] = useState<{ contents: string; filepath: string } | null>(
    null,
  );

  const hoverPreviewRef = useRef(hoverPreview);
  hoverPreviewRef.current = hoverPreview;
  const anchorRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsed = parseCodePath(candidate);
  const hasLineRef = parsed.line != null;

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => {
      setHoverPreview(null);
    }, 200);
  }, [cancelHide]);

  const handleMouseEnter = useCallback(() => {
    if (!hasLineRef || gate.render === "plain") return;
    cancelHide();

    if (hoverPreviewRef.current) return;
    showTimerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ path: candidate });

        if (baseDir) params.set("base", baseDir);
        const res = await fetch(`/api/doc?${params}`);

        if (!res.ok) return;
        const data = decodeCodeFileSuccessResponse(await res.json());

        if (data?.contents) setHoverPreview({ contents: data.contents, filepath: data.filepath });
      } catch {}
    }, 150);
  }, [candidate, hasLineRef, gate.render, cancelHide, baseDir]);

  const handleMouseLeave = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    scheduleHide();
  }, [scheduleHide]);

  const handlePreviewEnter = useCallback(() => {
    cancelHide();
  }, [cancelHide]);

  const handlePreviewLeave = useCallback(() => {
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);

      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  if (gate.render === "plain") {
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono"
        style={inlineCodeTypographyStyle}
      >
        {display}
      </code>
    );
  }

  const isAmbiguous = gate.render === "ambiguous-link";

  const lineSuffix =
    parsed.line != null
      ? `:${parsed.line}${parsed.lineEnd != null ? `-${parsed.lineEnd}` : ""}`
      : "";

  const handleClick = () => {
    handleMouseLeave();

    if (isAmbiguous) {
      setPickerOpen(true);

      return;
    }

    const resolvedPath = gate.render === "link" && gate.resolved ? gate.resolved : candidate;
    onOpenCodeFile(gate.render === "link" && gate.resolved ? resolvedPath + lineSuffix : candidate);
  };

  return (
    <>
      <code
        ref={(el) => {
          anchorRef.current = el;
        }}
        role="button"
        tabIndex={0}
        data-ambiguous={isAmbiguous ? "true" : undefined}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="code-file-link px-1.5 py-0.5 rounded bg-muted text-sm font-mono cursor-pointer hover:text-primary inline-flex items-center gap-1 transition-colors"
        style={inlineCodeTypographyStyle}
        title={isAmbiguous ? `${display} — multiple matches` : `View: ${display}`}
      >
        {display}
        <CodeFileIcon />
        {gate.render === "ambiguous-link" && (
          <sup className="text-[0.6rem] opacity-70 -ml-0.5">{gate.matches.length}</sup>
        )}
      </code>
      {hoverPreview && hasLineRef && (
        <CodeSnippetPreview
          anchorEl={anchorRef.current}
          contents={hoverPreview.contents}
          filepath={hoverPreview.filepath}
          line={parsed.line!}
          lineEnd={parsed.lineEnd}
          onMouseEnter={handlePreviewEnter}
          onMouseLeave={handlePreviewLeave}
        />
      )}
      {pickerOpen && gate.render === "ambiguous-link" && (
        <CodeFilePicker
          anchorEl={anchorRef.current}
          matches={gate.matches}
          onPick={(path) => {
            setPickerOpen(false);
            onOpenCodeFile(path + lineSuffix);
          }}
          onDismiss={() => setPickerOpen(false)}
        />
      )}
    </>
  );
};

const DANGEROUS_PROTOCOL = /^\s*(javascript|data|vbscript|file)\s*:/i;

function sanitizeLinkUrl(url: string): string | null {
  if (DANGEROUS_PROTOCOL.test(url)) return null;

  return url;
}

const CodeFileIcon = () => (
  <svg
    className="w-3 h-3 opacity-50 flex-shrink-0"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
);

// Trim trailing sentence punctuation from a bare URL, but keep closing
// brackets when they balance an opener inside the URL (Wikipedia-style
// https://…/Function_(mathematics) should keep its closing paren).
export function trimUrlTail(url: string): string {
  const balanced = (u: string, close: string, open: string): boolean => {
    let opens = 0,
      closes = 0;

    for (const c of u) {
      if (c === open) opens++;
      else if (c === close) closes++;
    }

    return opens >= closes;
  };

  while (url.length > 0) {
    const last = url[url.length - 1];

    if (!/[.,;:!?)\]}>"']/.test(last)) break;

    if (last === ")" && balanced(url, ")", "(")) break;

    if (last === "]" && balanced(url, "]", "[")) break;

    if (last === "}" && balanced(url, "}", "{")) break;
    url = url.slice(0, -1);
  }

  return url;
}

// Scan a plain-text chunk for bare https?:// URLs and bare code file paths
// at word boundaries, emitting them as interactive nodes. Surrounding text
// passes through transformPlainText for emoji shortcodes + smart punctuation.
function emitPlainTextWithBareUrls(
  text: string,
  previousChar: string,
  parts: React.ReactNode[],
  nextKey: () => number,
  onOpenCodeFile?: (path: string) => void,
  validation?: CodePathValidationContextValue | null,
  baseDir?: string,
): void {
  if (text.length === 0) return;

  type Span =
    | { start: number; end: number; kind: "url"; value: string }
    | { start: number; end: number; kind: "path"; value: string };

  const spans: Span[] = [];

  // Collect bare URLs
  const urlRe = /https?:\/\/[^\s<>"']+/g;
  let m: RegExpExecArray | null;

  while ((m = urlRe.exec(text)) !== null) {
    const before = m.index === 0 ? previousChar : text[m.index - 1];

    if (/\w/.test(before)) continue;
    const url = trimUrlTail(m[0]);
    const safe = url.length > 0 ? sanitizeLinkUrl(url) : null;

    if (!safe) continue;
    spans.push({ start: m.index, end: m.index + url.length, kind: "url", value: url });
    urlRe.lastIndex = m.index + url.length;
  }

  // Collect bare code file paths (require /)
  if (onOpenCodeFile) {
    const pathRe = new RegExp(CODE_PATH_BARE_REGEX.source, "g");

    while ((m = pathRe.exec(text)) !== null) {
      const before = m.index === 0 ? previousChar : text[m.index - 1];

      if (/\w/.test(before)) continue;
      const candidate = m[0];

      if (!isCodeFilePathStrict(candidate)) continue;
      const overlaps = spans.some((s) => m!.index < s.end && m!.index + candidate.length > s.start);

      if (overlaps) continue;
      spans.push({
        start: m.index,
        end: m.index + candidate.length,
        kind: "path",
        value: candidate,
      });
    }
  }

  if (spans.length === 0) {
    parts.push(transformPlainText(text));

    return;
  }

  spans.sort((a, b) => a.start - b.start);

  let last = 0;

  for (const span of spans) {
    if (span.start > last) {
      parts.push(transformPlainText(text.slice(last, span.start)));
    }

    if (span.kind === "url") {
      parts.push(
        <a
          key={nextKey()}
          href={span.value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {span.value}
        </a>,
      );
    } else {
      const cleanPath = span.value.replace(/#.*$/, "");
      const gate = gateCodePath(cleanPath, validation ?? null);

      if (gate.render === "plain") {
        // Bare prose, file doesn't exist — emit as plain text, no link styling.
        parts.push(transformPlainText(span.value));
      } else {
        parts.push(
          <CodeFileLink
            key={nextKey()}
            candidate={cleanPath}
            display={span.value}
            onOpenCodeFile={onOpenCodeFile!}
            baseDir={baseDir}
          />,
        );
      }
    }

    last = span.end;
  }

  if (last < text.length) {
    parts.push(transformPlainText(text.slice(last)));
  }
}

interface InlineMarkdownProps {
  text: string;
  onOpenLinkedDoc?: (path: string) => void;
  onOpenCodeFile?: (path: string) => void;
  onNavigateAnchor?: (hash: string) => void;
  imageBaseDir?: string;
  onImageClick?: (src: string, alt: string) => void;
  githubRepo?: string;
}

interface TokenParserContext extends InlineMarkdownProps {
  readonly previousChar: string;
  readonly validation: CodePathValidationContextValue | null;
  readonly nextKey: () => number;
}

interface TokenResult {
  readonly nodes: readonly React.ReactNode[];
  readonly consumed: number;
  readonly previousChar: string;
}

interface ParsedMarkdownLink {
  readonly linkText: string;
  readonly linkUrl: string;
  readonly consumed: number;
}

type TokenParser = (text: string, context: TokenParserContext) => TokenResult | null;

function tokenResult(
  nodes: readonly React.ReactNode[],
  consumed: number,
  previousChar: string,
): TokenResult {
  return { nodes, consumed, previousChar };
}

function matchPreviousChar(match: string, fallback: string): string {
  return match[match.length - 1] || fallback;
}

function renderNestedMarkdown(
  text: string,
  context: TokenParserContext,
  key?: React.Key,
): React.ReactNode {
  return (
    <InlineMarkdown
      key={key}
      imageBaseDir={context.imageBaseDir}
      onImageClick={context.onImageClick}
      text={text}
      onOpenLinkedDoc={context.onOpenLinkedDoc}
      onOpenCodeFile={context.onOpenCodeFile}
      onNavigateAnchor={context.onNavigateAnchor}
      githubRepo={context.githubRepo}
    />
  );
}

function parseHtmlComment(text: string): TokenResult | null {
  const match = text.match(/^<!--[\s\S]*?-->/);

  return match ? tokenResult([], match[0].length, ">") : null;
}

function parseEscape(text: string): TokenResult | null {
  const match = text.match(/^\\([\\*_`[\]~!.()\-#>+|{}&])/);

  return match ? tokenResult([match[1]], 2, match[1]) : null;
}

function parseBareUrl(text: string, context: TokenParserContext): TokenResult | null {
  if (/\w/.test(context.previousChar)) return null;
  const match = text.match(/^https?:\/\/[^\s<>"']+/);

  if (!match) return null;
  const url = trimUrlTail(match[0]);
  const safe = url.length > 0 ? sanitizeLinkUrl(url) : null;

  if (!safe) return null;

  return tokenResult(
    [
      <a
        key={context.nextKey()}
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {url}
      </a>,
    ],
    url.length,
    url[url.length - 1],
  );
}

function parseHttpAutolink(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^<(https?:\/\/[^>]+)>/);

  if (!match) return null;
  const url = match[1];

  return tokenResult(
    [
      <a
        key={context.nextKey()}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {url}
      </a>,
    ],
    match[0].length,
    ">",
  );
}

function parseEmailAutolink(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^<([^@>\s]+@[^>\s]+)>/);

  if (!match) return null;
  const email = match[1];

  return tokenResult(
    [
      <a
        key={context.nextKey()}
        href={`mailto:${email}`}
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {email}
      </a>,
    ],
    match[0].length,
    ">",
  );
}

function parseCustomAutolink(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^<([A-Za-z][A-Za-z0-9.+-]{0,31}:[^\s<>]*)>/);

  if (!match) return null;
  const content = match[1];

  return tokenResult([<span key={context.nextKey()}>{`<${content}>`}</span>], match[0].length, ">");
}

function parseStrikethrough(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^~~([\s\S]+?)~~/);

  return match
    ? tokenResult(
        [<del key={context.nextKey()}>{renderNestedMarkdown(match[1], context)}</del>],
        match[0].length,
        matchPreviousChar(match[0], context.previousChar),
      )
    : null;
}

function parseBoldItalic(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^\*\*\*([\s\S]+?)\*\*\*/);

  return match
    ? tokenResult(
        [
          <strong key={context.nextKey()} className="font-semibold">
            <em>{renderNestedMarkdown(match[1], context)}</em>
          </strong>,
        ],
        match[0].length,
        matchPreviousChar(match[0], context.previousChar),
      )
    : null;
}

function parseBold(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^\*\*([\s\S]+?)\*\*/);

  return match
    ? tokenResult(
        [
          <strong key={context.nextKey()} className="font-semibold">
            {renderNestedMarkdown(match[1], context)}
          </strong>,
        ],
        match[0].length,
        matchPreviousChar(match[0], context.previousChar),
      )
    : null;
}

function parseStarItalic(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^\*([\s\S]+?)\*/);

  return match
    ? tokenResult(
        [<em key={context.nextKey()}>{renderNestedMarkdown(match[1], context)}</em>],
        match[0].length,
        matchPreviousChar(match[0], context.previousChar),
      )
    : null;
}

function parseUnderscoreItalic(text: string, context: TokenParserContext): TokenResult | null {
  if (/\w/.test(context.previousChar)) return null;
  const match = text.match(/^_([^_\s](?:[\s\S]*?[^_\s])?)_(?!\w)/);

  return match
    ? tokenResult(
        [<em key={context.nextKey()}>{renderNestedMarkdown(match[1], context)}</em>],
        match[0].length,
        matchPreviousChar(match[0], context.previousChar),
      )
    : null;
}

function parseInlineCode(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^`([^`]+)`/);

  if (!match) return null;
  const codeContent = match[1];

  const node =
    isCodeFilePath(codeContent) && context.onOpenCodeFile ? (
      <CodeFileLink
        key={context.nextKey()}
        candidate={codeContent.replace(/#.*$/, "")}
        display={codeContent}
        onOpenCodeFile={context.onOpenCodeFile}
        baseDir={context.imageBaseDir}
      />
    ) : (
      <code
        key={context.nextKey()}
        className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono"
        style={inlineCodeTypographyStyle}
      >
        {codeContent}
      </code>
    );

  return tokenResult([node], match[0].length, matchPreviousChar(match[0], context.previousChar));
}

function parseColor(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(
    /^(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{4}|(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{3}))(?![0-9a-fA-F\w])/,
  );

  if (!match) return null;
  const hex = match[1];

  return tokenResult(
    [
      <span key={context.nextKey()} className="inline-flex items-center gap-1 align-middle">
        <span
          className="inline-block w-3.5 h-3.5 rounded-sm border border-black/20 dark:border-white/20 flex-shrink-0"
          style={{ backgroundColor: hex }}
          title={hex}
        />
        <code
          className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono"
          style={inlineCodeTypographyStyle}
        >
          {hex}
        </code>
      </span>,
    ],
    match[0].length,
    matchPreviousChar(match[0], context.previousChar),
  );
}

function parseIssue(text: string, context: TokenParserContext): TokenResult | null {
  if (/\w/.test(context.previousChar)) return null;
  const match = text.match(/^#(\d+)(?!\w)/);

  if (!match) return null;
  const num = match[1];

  const href = context.githubRepo?.includes("/")
    ? `https://github.com/${context.githubRepo}/issues/${num}`
    : null;

  const label = `#${num}`;

  const node = href ? (
    <a
      key={context.nextKey()}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary font-medium hover:underline"
    >
      {label}
    </a>
  ) : (
    <span key={context.nextKey()} className="text-primary font-medium">
      {label}
    </span>
  );

  return tokenResult([node], match[0].length, matchPreviousChar(match[0], context.previousChar));
}

function parseMention(text: string, context: TokenParserContext): TokenResult | null {
  if (/\w/.test(context.previousChar)) return null;
  const match = text.match(/^@([a-zA-Z][a-zA-Z0-9_-]{0,38})(?!\w)/);

  if (!match) return null;
  const handle = match[1];
  const href = context.githubRepo?.includes("/") ? `https://github.com/${handle}` : null;
  const label = `@${handle}`;

  const node = href ? (
    <a
      key={context.nextKey()}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary font-medium hover:underline"
    >
      {label}
    </a>
  ) : (
    <span key={context.nextKey()} className="text-primary font-medium">
      {label}
    </span>
  );

  return tokenResult([node], match[0].length, matchPreviousChar(match[0], context.previousChar));
}

function parseWikiLink(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);

  if (!match) return null;
  const target = match[1].trim();
  const display = match[2]?.trim() || target;
  const targetPath = /\.(mdx?|txt|html?)$/i.test(target) ? target : `${target}.md`;

  const node = context.onOpenLinkedDoc ? (
    <a
      key={context.nextKey()}
      href={targetPath}
      onClick={(event) => {
        event.preventDefault();
        context.onOpenLinkedDoc?.(targetPath);
      }}
      className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1 cursor-pointer"
      title={`Open: ${target}`}
    >
      {display}
      <svg
        className="w-3 h-3 opacity-50 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    </a>
  ) : (
    <span key={context.nextKey()} className="text-primary">
      {display}
    </span>
  );

  return tokenResult([node], match[0].length, matchPreviousChar(match[0], context.previousChar));
}

function parseImage(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/^!\[([^\]]*)\]\(([^)]+)\)/);

  if (!match) return null;
  const alt = match[1];
  const src = match[2];

  const imgSrc = /^(https?:\/\/|data:|blob:)/i.test(src)
    ? src
    : getImageSrc(src, context.imageBaseDir);

  return tokenResult(
    [
      <img
        key={context.nextKey()}
        src={imgSrc}
        alt={alt}
        className="max-w-full rounded my-2 cursor-zoom-in"
        loading="lazy"
        onClick={(event) => {
          event.stopPropagation();
          context.onImageClick?.(imgSrc, alt);
        }}
      />,
    ],
    match[0].length,
    matchPreviousChar(match[0], context.previousChar),
  );
}

function findMarkdownLinkTextEnd(text: string): number | null {
  let index = 1;
  let depth = 1;

  while (index < text.length && depth > 0) {
    const character = text[index];

    if (character === "\\" && index + 1 < text.length) {
      index += 2;
      continue;
    }

    if (character === "[") depth++;
    else if (character === "]") depth--;

    if (depth === 0) break;
    index++;
  }

  return depth === 0 && text[index + 1] === "(" ? index : null;
}

function findMarkdownLinkDestinationEnd(text: string, textEnd: number): number | null {
  let destinationIndex = textEnd + 2;
  let parenthesisDepth = 1;

  while (destinationIndex < text.length && parenthesisDepth > 0) {
    const character = text[destinationIndex];

    if (character === "\\" && destinationIndex + 1 < text.length) {
      destinationIndex += 2;
      continue;
    }

    if (character === "(") parenthesisDepth++;
    else if (character === ")") {
      parenthesisDepth--;

      if (parenthesisDepth === 0) break;
    } else if (character === "\n") {
      return null;
    }

    destinationIndex++;
  }

  return parenthesisDepth === 0 ? destinationIndex : null;
}

function parseMarkdownLink(text: string): ParsedMarkdownLink | null {
  if (text[0] !== "[") return null;
  const textEnd = findMarkdownLinkTextEnd(text);

  if (textEnd === null) return null;
  const destinationEnd = findMarkdownLinkDestinationEnd(text, textEnd);

  if (destinationEnd === null) return null;
  const linkText = text.slice(1, textEnd);
  const linkUrl = text.slice(textEnd + 2, destinationEnd);

  return linkText && linkUrl ? { linkText, linkUrl, consumed: destinationEnd + 1 } : null;
}

function parseMarkdownLinkToken(text: string, context: TokenParserContext): TokenResult | null {
  const parsed = parseMarkdownLink(text);

  if (!parsed) return null;
  const { linkText, linkUrl, consumed } = parsed;
  const safeLinkUrl = sanitizeLinkUrl(linkUrl);

  if (safeLinkUrl === null) {
    return tokenResult([<span key={context.nextKey()}>{linkText}</span>], consumed, ")");
  }

  const isLocalDoc =
    /\.(mdx?|txt|html?)(#.*)?$/i.test(linkUrl) &&
    !linkUrl.startsWith("http://") &&
    !linkUrl.startsWith("https://");

  const isCodeFile = !isLocalDoc && isCodeFilePath(linkUrl);
  const linkedDocPath = isLocalDoc ? linkUrl.replace(/#.*$/, "") : linkUrl;
  const codeFilePath = isCodeFile ? linkUrl.replace(/#.*$/, "") : linkUrl;
  const isInPageAnchor = safeLinkUrl.startsWith("#");

  const node = isInPageAnchor
    ? renderAnchorLink(linkText, safeLinkUrl, context)
    : isLocalDoc && context.onOpenLinkedDoc
      ? renderLocalDocLink(linkText, linkUrl, linkedDocPath, safeLinkUrl, context)
      : isCodeFile && context.onOpenCodeFile
        ? renderCodeFileLink(linkText, linkUrl, codeFilePath, safeLinkUrl, context)
        : renderExternalLink(linkText, safeLinkUrl, isLocalDoc, context);

  return tokenResult([node], consumed, ")");
}

function renderAnchorLink(
  linkText: string,
  href: string,
  context: TokenParserContext,
): React.ReactNode {
  return (
    <a
      key={context.nextKey()}
      href={href}
      onClick={
        context.onNavigateAnchor
          ? (event) => {
              event.preventDefault();
              context.onNavigateAnchor?.(href);
            }
          : undefined
      }
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {linkText}
    </a>
  );
}

function renderLocalDocLink(
  linkText: string,
  linkUrl: string,
  path: string,
  href: string,
  context: TokenParserContext,
): React.ReactNode {
  return (
    <a
      key={context.nextKey()}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        context.onOpenLinkedDoc?.(path);
      }}
      className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1 cursor-pointer"
      title={`Open: ${linkUrl}`}
    >
      {linkText}
      <svg
        className="w-3 h-3 opacity-50 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    </a>
  );
}

function renderCodeFileLink(
  linkText: string,
  linkUrl: string,
  path: string,
  href: string,
  context: TokenParserContext,
): React.ReactNode {
  return (
    <a
      key={context.nextKey()}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        context.onOpenCodeFile?.(path);
      }}
      className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-1 cursor-pointer"
      title={`View: ${linkUrl}`}
    >
      {linkText}
      <CodeFileIcon />
    </a>
  );
}

function renderExternalLink(
  linkText: string,
  href: string,
  isLocalDoc: boolean,
  context: TokenParserContext,
): React.ReactNode {
  return (
    <a
      key={context.nextKey()}
      href={href}
      target={isLocalDoc ? undefined : "_blank"}
      rel={isLocalDoc ? undefined : "noopener noreferrer"}
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {linkText}
    </a>
  );
}

function parseHardBreak(text: string, context: TokenParserContext): TokenResult | null {
  const match = text.match(/ {2,}\n|\\\n/);

  if (!match || match.index === undefined) return null;
  const before = text.slice(0, match.index);

  const nodes = before
    ? [renderNestedMarkdown(before, context, context.nextKey()), <br key={context.nextKey()} />]
    : [<br key={context.nextKey()} />];

  return tokenResult(nodes, match.index + match[0].length, "\n");
}

function parsePlainText(text: string, context: TokenParserContext): TokenResult {
  const nextSpecial = text.slice(1).search(/[*_`[!~\\<#@]/);
  const plainText = nextSpecial === -1 ? text : text.slice(0, nextSpecial + 1);
  const nodes: React.ReactNode[] = [];
  emitPlainTextWithBareUrls(
    plainText,
    context.previousChar,
    nodes,
    context.nextKey,
    context.onOpenCodeFile,
    context.validation,
    context.imageBaseDir,
  );

  return tokenResult(
    nodes,
    plainText.length,
    plainText[plainText.length - 1] || context.previousChar,
  );
}

const tokenParsers = [
  parseHtmlComment,
  parseEscape,
  parseBareUrl,
  parseHttpAutolink,
  parseEmailAutolink,
  parseCustomAutolink,
  parseStrikethrough,
  parseBoldItalic,
  parseBold,
  parseStarItalic,
  parseUnderscoreItalic,
  parseInlineCode,
  parseColor,
  parseIssue,
  parseMention,
  parseWikiLink,
  parseImage,
  parseMarkdownLinkToken,
  parseHardBreak,
  parsePlainText,
] as const satisfies readonly TokenParser[];

/**
 * Scanner that walks a text string and emits React nodes for inline markdown.
 * Token parsers are ordered from most-specific to fallback to preserve markdown precedence.
 */
export const InlineMarkdown: React.FC<InlineMarkdownProps> = (props) => {
  const validation = useCodePathValidation();
  const parts: React.ReactNode[] = [];
  let remaining = props.text;
  let key = 0;
  let previousChar = "";

  while (remaining.length > 0) {
    const context: TokenParserContext = {
      ...props,
      previousChar,
      validation,
      nextKey: () => key++,
    };

    for (const parser of tokenParsers) {
      const token = parser(remaining, context);

      if (!token) continue;
      parts.push(...token.nodes);
      remaining = remaining.slice(token.consumed);
      previousChar = token.previousChar;
      break;
    }
  }

  return <>{parts}</>;
};
