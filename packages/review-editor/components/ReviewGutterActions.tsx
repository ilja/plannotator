import React from 'react';
import type { SelectedLineRange } from '@plannotator/ui/types';
import { SparklesIcon } from '@plannotator/ui/components/SparklesIcon';

export interface HoveredDiffLine {
  lineNumber: number;
  side: 'additions' | 'deletions';
}

interface ReviewGutterActionsProps {
  getHoveredLine: () => HoveredDiffLine | undefined;
  aiAvailable: boolean;
  onComment: (range: SelectedLineRange) => void;
  onAttachAI: (line: HoveredDiffLine) => void;
}

const buttonStyle: React.CSSProperties = {
  appearance: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1lh',
  height: '1lh',
  fontSize: 'var(--diffs-font-size, 13px)',
  lineHeight: 'var(--diffs-line-height, 20px)',
  border: 'none',
  borderRadius: 4,
  backgroundColor: 'var(--diffs-modified-base)',
  color: 'var(--diffs-bg)',
  cursor: 'pointer',
  position: 'relative',
  zIndex: 4,
  padding: 0,
};

export const ReviewGutterActions: React.FC<ReviewGutterActionsProps> = ({
  getHoveredLine,
  aiAvailable,
  onComment,
  onAttachAI,
}) => {
  const brighten = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.filter = 'brightness(1.2)';
  };
  const reset = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.style.filter = '';
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 'calc(1ch - 1lh)' }}>
      <button
        type="button"
        style={buttonStyle}
        title="Add code comment"
        data-gutter-size="1lh"
        onMouseEnter={brighten}
        onMouseLeave={reset}
        onClick={(event) => {
          event.stopPropagation();
          const line = getHoveredLine();
          if (!line) return;
          onComment({
            start: line.lineNumber,
            end: line.lineNumber,
            side: line.side,
          });
        }}
      >
        +
      </button>
      {aiAvailable && (
        <button
          type="button"
          style={buttonStyle}
          title="Attach line to AI chat"
          aria-label="Attach line to AI chat"
          data-gutter-size="1lh"
          onMouseEnter={brighten}
          onMouseLeave={reset}
          onClick={(event) => {
            event.stopPropagation();
            const line = getHoveredLine();
            if (!line) return;
            onAttachAI(line);
          }}
        >
          <SparklesIcon className="w-[0.8em] h-[0.8em]" />
        </button>
      )}
    </div>
  );
};
