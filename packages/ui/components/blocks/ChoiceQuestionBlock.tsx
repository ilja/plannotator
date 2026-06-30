import React from 'react';
import type { Block } from '../../types';
import { InlineMarkdown } from '../InlineMarkdown';

const proseStyle: React.CSSProperties = {
  fontFamily: 'var(--annotation-prose-font-family, var(--font-sans))',
  fontSize: 'var(--annotation-prose-font-size, 15px)',
};

type ChoiceQuestionBlockProps = {
  block: Block;
  onOpenLinkedDoc?: (path: string) => void;
  onOpenCodeFile?: (path: string) => void;
  imageBaseDir?: string;
  onImageClick?: (src: string, alt: string) => void;
  githubRepo?: string;
  onNavigateAnchor?: (hash: string) => void;
};

export const ChoiceQuestionBlock: React.FC<ChoiceQuestionBlockProps> = ({
  block,
  onOpenLinkedDoc,
  onOpenCodeFile,
  imageBaseDir,
  onImageClick,
  githubRepo,
  onNavigateAnchor,
}) => {
  const options = block.choiceOptions ?? [];
  const recommendationLine = block.sourceText
    ?.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .at(-1);
  const inlineProps = {
    imageBaseDir,
    onImageClick,
    onOpenLinkedDoc,
    onOpenCodeFile,
    githubRepo,
    onNavigateAnchor,
  };

  return (
    <section
      className="my-5 rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm"
      style={proseStyle}
      data-block-id={block.id}
      data-choice-question="true"
    >
      <div className="mb-3 text-sm font-semibold text-foreground">
        <InlineMarkdown {...inlineProps} text={block.content} />
      </div>
      <div className="grid gap-2">
        {options.map(option => {
          const recommended = option.label === block.recommendedChoiceLabel;

          return (
            <div
              key={option.label}
              className="rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-left transition-colors"
              data-choice-option-label={option.label}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Option {option.label}
                  </div>
                  <div className="mt-1 text-sm leading-relaxed text-foreground/90">
                    <InlineMarkdown {...inlineProps} text={option.text} />
                  </div>
                </div>
                {recommended && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Recommended
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {recommendationLine && (
        <div
          className="mt-3 text-sm leading-relaxed text-foreground/90"
          data-choice-recommendation="true"
        >
          <InlineMarkdown {...inlineProps} text={recommendationLine} />
        </div>
      )}
    </section>
  );
};
