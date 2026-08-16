import React, { useCallback, useEffect, useRef } from 'react';
import { submitHint } from '@plannotator/ui/utils/platform';
import { FileNameChip } from './FileNameChip';
import { formatLineRange } from '../utils/formatLineRange';
import type { PendingAIContext } from '../utils/pendingAIContext';

interface AIChatComposerProps {
  value: string;
  pendingContext: PendingAIContext | null;
  focusToken: number;
  disabled?: boolean;
  isStreaming?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onRemoveContext: () => void;
  onStop?: () => void;
}

/** Chat composer pinned at bottom — textarea grows upward on multi-line. */
export const AIChatComposer: React.FC<AIChatComposerProps> = ({
  value,
  pendingContext,
  focusToken,
  disabled = false,
  isStreaming = false,
  onChange,
  onSubmit,
  onRemoveContext,
  onStop,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => { autoResize(); }, [value, autoResize]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [focusToken]);

  return (
    <div className="border-t border-border/50 p-2">
      {pendingContext && (
        <div className="ai-pending-context">
          <FileNameChip path={pendingContext.filePath} />
          <span>{formatLineRange(pendingContext.lineStart, pendingContext.lineEnd)}</span>
          <button
            type="button"
            className="ai-pending-context-remove"
            onClick={onRemoveContext}
            aria-label="Remove AI context"
            title="Remove context"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask about the overall changes..."
          rows={1}
          className="flex-1 px-2.5 py-1.5 bg-muted rounded-md text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 leading-relaxed"
          style={{ maxHeight: 120 }}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && !disabled) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        {isStreaming && onStop ? (
          <button
            onClick={onStop}
            className="p-1.5 mb-px rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            title="Stop generating"
            aria-label="Stop generating"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={disabled || !value.trim()}
            className="p-1.5 mb-px rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            title={`Send (${submitHint})`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
