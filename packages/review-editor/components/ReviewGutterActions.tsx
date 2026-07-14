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

const wrapperStyle = (aiAvailable: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  justifyContent: 'flex-end',
  width: aiAvailable ? 'calc(2lh + 2px)' : 'calc(1lh)',
  marginLeft: aiAvailable ? 'calc(-1lh - 2px)' : 'calc(0px)',
});

function applyStyles(element: HTMLElement, styles: React.CSSProperties) {
  Object.assign(element.style, styles);
}

function createButton(label: string, title: string, ariaLabel?: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = title;
  button.dataset.gutterSize = '1lh';
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  applyStyles(button, buttonStyle);
  button.addEventListener('mouseenter', () => { button.style.filter = 'brightness(1.2)'; });
  button.addEventListener('mouseleave', () => { button.style.filter = ''; });
  button.innerHTML = label;
  return button;
}

export function createReviewGutterActionsElement({
  getHoveredLine,
  aiAvailable,
  onComment,
  onAttachAI,
}: ReviewGutterActionsProps): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.dataset.testid = 'review-gutter-actions';
  applyStyles(wrapper, wrapperStyle(aiAvailable));

  const commentButton = createButton('+', 'Add code comment');
  commentButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const line = getHoveredLine();
    if (!line) return;
    onComment({
      start: line.lineNumber,
      end: line.lineNumber,
      side: line.side,
    });
  });
  wrapper.appendChild(commentButton);

  if (aiAvailable) {
    const aiButton = createButton(
      '<svg style="width:0.8em;height:0.8em" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.25 7.5L17.5 9.75l-.75-2.25a3 3 0 00-2-2L12.5 4.75l2.25-.75a3 3 0 002-2l.75-2.25.75 2.25a3 3 0 002 2l2.25.75-2.25.75a3 3 0 00-2 2z" /></svg>',
      'Attach line to AI chat',
      'Attach line to AI chat',
    );
    aiButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const line = getHoveredLine();
      if (!line) return;
      onAttachAI(line);
    });
    wrapper.appendChild(aiButton);
  }

  return wrapper;
}

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
    <div data-testid="review-gutter-actions" style={wrapperStyle(aiAvailable)}>
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
