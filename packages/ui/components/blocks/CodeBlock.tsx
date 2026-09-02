import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from "react";
import { Block } from "../../types";
import { useTheme } from "../ThemeProvider";
import { resolveShikiThemeName } from "../../utils/syntaxThemeRegistry";
import { highlightCodeElement, invalidateCodeHighlight } from "./codeHighlightingDom";
import { checkSizeLimits, normalizeLanguage } from "./codeHighlighting";

interface CodeBlockProps {
  block: Block;
  onHover: (element: HTMLElement) => void;
  onLeave: () => void;
  isHovered: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  block,
  onHover,
  onLeave,
  isHovered: _isHovered,
}) => {
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLElement>(null);
  const { colorTheme, resolvedMode } = useTheme();
  const themeName = useMemo(
    () => resolveShikiThemeName(colorTheme, resolvedMode),
    [colorTheme, resolvedMode],
  );

  const normalizedLanguage = normalizeLanguage(block.language);
  const dataLanguage = normalizedLanguage ?? block.language ?? "";

  // Keep code element in sync with block.content when not highlighted/annotated
  // Use layout effect so plain text is visible before async highlight
  useLayoutEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    // Don't overwrite if already highlighted with same code or if annotated
    if (el.querySelector("mark[data-bind-id]")) return;
    const currentText = el.textContent ?? "";
    // If element is empty or plain text differs, set plain
    if (currentText !== block.content) {
      // Only reset if not already highlighted with same code
      // Check if highlighted content reconstructs to same text
      // For now, if data-syntax-state is highlighted and text matches, keep it until new highlight
      const state = el.getAttribute("data-syntax-state");
      if (state === "highlighted" && currentText === block.content) {
        // Already highlighted with same code – keep until theme change triggers new highlight
        // But if code changed, we need to reset
        if (el.textContent !== block.content) {
          el.textContent = block.content;
          el.setAttribute("data-syntax-state", "plain");
        }
      } else {
        el.textContent = block.content;
        el.setAttribute("data-syntax-state", "plain");
      }
    }
  }, [block.content]);

  useEffect(() => {
    const el = codeRef.current;
    if (!el) return;

    const normalized = normalizeLanguage(block.language);
    const sizeReason = checkSizeLimits(block.content);
    if (sizeReason === "empty") {
      el.textContent = block.content;
      el.setAttribute("data-syntax-state", "plain");
      return;
    }
    if (sizeReason || !normalized) {
      // Ensure plain text visible for fallback
      if (el.textContent !== block.content) el.textContent = block.content;
      el.setAttribute("data-syntax-state", "fallback");
      return;
    }

    // Don't highlight if already annotated
    if (el.querySelector("mark[data-bind-id]")) {
      return;
    }

    el.setAttribute("data-syntax-state", "loading");
    void highlightCodeElement(el, block.content, block.language, themeName);

    return () => {
      if (el) invalidateCodeHighlight(el);
    };
  }, [block.content, block.language, themeName]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(block.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [block.content]);

  const handleMouseEnter = () => {
    if (containerRef.current) {
      onHover(containerRef.current);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative group my-5"
      data-block-id={block.id}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
    >
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10"
        title={copied ? "Copied!" : "Copy code"}
      >
        {copied ? (
          <svg
            className="w-4 h-4 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
      <pre
        className="rounded-lg overflow-x-auto bg-muted/50 border border-border/30"
        style={{ fontSize: "var(--annotation-code-font-size, 13px)" }}
      >
        <code
          ref={codeRef}
          className={`font-mono${normalizedLanguage ? ` language-${normalizedLanguage}` : ""}`}
          data-markdown-code-block="true"
          data-language={dataLanguage}
          data-syntax-state="plain"
          style={{ fontFamily: "var(--annotation-code-font-family, var(--font-mono))" }}
        />
      </pre>
    </div>
  );
};
