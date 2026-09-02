import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Effect } from "effect";
import * as Fiber from "effect/Fiber";
import { Block } from "../../types";
import { useTheme } from "../ThemeProvider";
import { resolveShikiThemeName } from "../../utils/syntaxThemeRegistry";
import { getCodeHighlightingRuntime } from "./codeHighlightingRuntime";
import {
  CodeHighlightingService,
  type HighlightResult,
  checkSizeLimits,
  normalizeLanguage,
} from "./codeHighlighting";

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

  const [highlightResult, setHighlightResult] = useState<HighlightResult | null>(null);
  const [syntaxState, setSyntaxState] = useState<"plain" | "loading" | "highlighted" | "fallback">(
    "plain",
  );
  const generationRef = useRef(0);
  const fiberRef = useRef<Fiber.Fiber<unknown, unknown> | null>(null);

  useEffect(() => {
    const normalized = normalizeLanguage(block.language);
    const sizeReason = checkSizeLimits(block.content);

    // Pure fallback cases – no provider needed
    if (sizeReason === "empty") {
      setHighlightResult({ _tag: "PlainText", reason: "empty" });
      setSyntaxState("plain");
      return;
    }
    if (sizeReason) {
      setHighlightResult({ _tag: "PlainText", reason: sizeReason });
      setSyntaxState("fallback");
      return;
    }
    if (!normalized) {
      setHighlightResult({ _tag: "PlainText", reason: "unlabelled" });
      setSyntaxState("fallback");
      return;
    }

    const gen = ++generationRef.current;
    setSyntaxState("loading");
    setHighlightResult(null);

    const runtime = getCodeHighlightingRuntime();
    const effect = Effect.gen(function* () {
      const svc = yield* CodeHighlightingService;
      const result = yield* svc.highlight({
        code: block.content,
        language: block.language,
        themeName,
      });
      return result;
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          if (gen !== generationRef.current) return;
          if (!codeRef.current?.isConnected) return;
          if (codeRef.current.querySelector("mark[data-bind-id]")) return;
          setHighlightResult(result);
          setSyntaxState(result._tag === "Highlighted" ? "highlighted" : "fallback");
        }),
      ),
      Effect.catch(() =>
        Effect.sync(() => {
          if (gen !== generationRef.current) return;
          if (!codeRef.current?.isConnected) return;
          setHighlightResult({ _tag: "PlainText", reason: "provider-error" });
          setSyntaxState("fallback");
        }),
      ),
    );

    const fiber = runtime.runFork(effect as unknown as Effect.Effect<void, never, never>);
    // Store as unknown due to Fiber variance
    fiberRef.current = fiber as unknown as Fiber.Fiber<unknown, unknown>;

    return () => {
      generationRef.current++;
      const f = fiberRef.current;
      if (f) {
        fiberRef.current = null;
        runtime.runFork(Fiber.interrupt(f as Fiber.Fiber<never, never>));
      }
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

  const normalizedLanguage = normalizeLanguage(block.language);
  const dataLanguage = normalizedLanguage ?? block.language ?? "";

  const renderContent = () => {
    if (!highlightResult || highlightResult._tag === "PlainText") {
      return block.content;
    }
    return highlightResult.lines.map((line, lineIdx) => (
      <React.Fragment key={lineIdx}>
        {line.map((token, tokenIdx) => (
          <span
            key={`${lineIdx}-${tokenIdx}`}
            style={
              token.htmlStyle
                ? parseStyle(token.htmlStyle)
                : token.color
                  ? { color: token.color }
                  : undefined
            }
          >
            {token.content}
          </span>
        ))}
        {lineIdx < highlightResult.lines.length - 1 ? "\n" : null}
      </React.Fragment>
    ));
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
          data-syntax-state={syntaxState}
          style={{ fontFamily: "var(--annotation-code-font-family, var(--font-mono))" }}
        >
          {renderContent()}
        </code>
      </pre>
    </div>
  );
};

function parseStyle(htmlStyle: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const part of htmlStyle.split(";")) {
    const [key, value] = part.split(":").map((s) => s.trim());
    if (!key || !value) continue;
    // Convert kebab-case to camelCase
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    style[camel] = value;
  }
  return style as React.CSSProperties;
}
