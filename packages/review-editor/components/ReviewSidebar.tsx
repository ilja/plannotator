import React, { useState } from "react";
import {
  CodeAnnotation,
  type CodeAnnotationScope,
  type EditorAnnotation,
} from "@plannotator/ui/types";
import { CommentMeta } from "./CommentMeta";
import { EditorAnnotationCard } from "@plannotator/ui/components/EditorAnnotationCard";
import { CommentActions } from "./CommentActions";
import { commentCopyText } from "../utils/annotationDisplay";
import { HighlightedCode } from "./HighlightedCode";
import { detectLanguage } from "../utils/detectLanguage";
import { renderInlineMarkdown } from "../utils/renderInlineMarkdown";
import { FileNameChip } from "./FileNameChip";
import { AITab } from "./AITab";
import type { PRMetadata } from "@plannotator/shared/pr-types";
import { OverlayScrollArea } from "@plannotator/ui/components/OverlayScrollArea";
import type { AIChatEntry } from "../hooks/useAIChat";
import type { DiffFile } from "../types";
import type { AIProviderOption } from "@plannotator/ui/utils/aiProvider";
import type { PendingAIContext } from "../utils/pendingAIContext";

export type ReviewSidebarTab = "annotations" | "ai";

interface ReviewSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ReviewSidebarTab;
  annotations: CodeAnnotation[];
  files: DiffFile[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  /** Sidebar row click → select AND scroll the diff to the comment. */
  onNavigateToAnnotation: (id: string | null) => void;
  onDeleteAnnotation: (id: string) => void;
  feedbackMarkdown?: string;
  width?: number;
  editorAnnotations?: EditorAnnotation[];
  onDeleteEditorAnnotation?: (id: string) => void;
  prMetadata?: PRMetadata | null;
  // AI props
  aiAvailable?: boolean;
  aiMessages?: AIChatEntry[];
  isAICreatingSession?: boolean;
  isAIStreaming?: boolean;
  onScrollToAILines?: (
    filePath: string,
    lineStart: number,
    lineEnd: number,
    side: "old" | "new",
  ) => void;
  activeFilePath?: string;
  scrollToQuestionId?: string | null;
  onAskChat?: (question: string) => void;
  pendingAIContext?: PendingAIContext | null;
  aiComposerFocusToken?: number;
  onRemovePendingAIContext?: () => void;
  aiPermissionRequests?: import("../hooks/useAIChat").PendingPermission[];
  onRespondToPermission?: (requestId: string, allow: boolean) => void;
  aiProviders?: AIProviderOption[];
  aiConfig?: { providerId: string | null; model: string | null; reasoningEffort?: string | null };
  onAIConfigChange?: (config: {
    providerId?: string | null;
    model?: string | null;
    reasoningEffort?: string | null;
  }) => void;
  hasAISession?: boolean;
  onOpenPRPanel?: (type: "summary" | "comments" | "checks") => void;
}

interface AnnotationGroups {
  generalAnnotations: CodeAnnotation[];
  groupedAnnotations: Map<string, CodeAnnotation[]>;
  prGroups: Map<string, Map<string, CodeAnnotation[]>> | null;
  isMultiPR: boolean;
}

const SCOPE_ORDER = { general: 0, file: 1, line: 2 } as const;

function getAnnotationScope(annotation: CodeAnnotation): CodeAnnotationScope {
  return annotation.scope ?? "line";
}

function compareCodeAnnotations(a: CodeAnnotation, b: CodeAnnotation): number {
  const aScope = getAnnotationScope(a);
  const bScope = getAnnotationScope(b);

  if (aScope !== bScope) {
    return SCOPE_ORDER[aScope] - SCOPE_ORDER[bScope];
  }

  return aScope === "line" ? a.lineStart - b.lineStart : b.createdAt - a.createdAt;
}

function useAnnotationGroups(annotations: CodeAnnotation[]): AnnotationGroups {
  return React.useMemo(() => {
    const generalAnnotations: CodeAnnotation[] = [];
    const placedAnnotations: CodeAnnotation[] = [];

    for (const annotation of annotations) {
      if (getAnnotationScope(annotation) === "general") {
        generalAnnotations.push(annotation);
      } else {
        placedAnnotations.push(annotation);
      }
    }

    generalAnnotations.sort((a, b) => b.createdAt - a.createdAt);

    const groupedAnnotations = groupAnnotationsByFile(placedAnnotations);

    const prGroups = hasMultiplePRs(placedAnnotations)
      ? groupAnnotationsByPR(placedAnnotations)
      : null;

    return {
      generalAnnotations,
      groupedAnnotations,
      prGroups,
      isMultiPR: prGroups !== null,
    };
  }, [annotations]);
}

function groupAnnotationsByFile(annotations: CodeAnnotation[]): Map<string, CodeAnnotation[]> {
  const groupedAnnotations = new Map<string, CodeAnnotation[]>();

  for (const annotation of annotations) {
    const fileAnnotations = groupedAnnotations.get(annotation.filePath) ?? [];
    fileAnnotations.push(annotation);
    groupedAnnotations.set(annotation.filePath, fileAnnotations);
  }

  for (const fileAnnotations of groupedAnnotations.values()) {
    fileAnnotations.sort(compareCodeAnnotations);
  }

  return groupedAnnotations;
}

function hasMultiplePRs(annotations: CodeAnnotation[]): boolean {
  return (
    new Set(
      annotations.flatMap((annotation) => {
        const prUrl = annotation.prUrl;

        return prUrl ? [prUrl] : [];
      }),
    ).size > 1
  );
}

function groupAnnotationsByPR(
  annotations: CodeAnnotation[],
): Map<string, Map<string, CodeAnnotation[]>> {
  const prGroups = new Map<string, Map<string, CodeAnnotation[]>>();

  for (const annotation of annotations) {
    const prKey = annotation.prUrl ?? "_none";
    const fileAnnotations = prGroups.get(prKey) ?? new Map<string, CodeAnnotation[]>();
    const annotationsForFile = fileAnnotations.get(annotation.filePath) ?? [];
    annotationsForFile.push(annotation);
    fileAnnotations.set(annotation.filePath, annotationsForFile);
    prGroups.set(prKey, fileAnnotations);
  }

  for (const fileAnnotations of prGroups.values()) {
    for (const annotationsForFile of fileAnnotations.values()) {
      annotationsForFile.sort(compareCodeAnnotations);
    }
  }

  return prGroups;
}

function useQuickCopyFeedback(feedbackMarkdown?: string) {
  const [copied, setCopied] = useState(false);

  const copyFeedback = async () => {
    if (!feedbackMarkdown) return;

    try {
      await navigator.clipboard.writeText(feedbackMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return { copied, copyFeedback };
}

const SuggestionPreview: React.FC<{ code: string; originalCode?: string; language?: string }> = ({
  code,
  originalCode,
  language,
}) => {
  const diffStats = originalCode
    ? {
        removed: originalCode.split("\n").length,
        added: code.split("\n").length,
      }
    : null;

  return (
    <div className="suggestion-block compact">
      <div className="suggestion-block-header">
        <svg
          className="w-2.5 h-2.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
        </svg>
        Suggestion
        {diffStats && (
          <span className="ml-auto text-[9px] font-mono">
            <span style={{ color: "var(--success)" }}>+{diffStats.added}</span>{" "}
            <span style={{ color: "var(--destructive)" }}>-{diffStats.removed}</span>
          </span>
        )}
      </div>
      <pre className="suggestion-block-code">
        <HighlightedCode code={code} language={language} />
      </pre>
    </div>
  );
};

interface AnnotationCardProps {
  annotation: CodeAnnotation;
  isSelected: boolean;
  onNavigateToAnnotation: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;
}

const AnnotationCard: React.FC<AnnotationCardProps> = ({
  annotation,
  isSelected,
  onNavigateToAnnotation,
  onDeleteAnnotation,
}) => {
  const scope = getAnnotationScope(annotation);
  const isFileScope = scope === "file";
  const isGeneralScope = scope === "general";

  return (
    <div
      onClick={() => onNavigateToAnnotation(annotation.id)}
      className={`group relative p-2.5 rounded border cursor-pointer transition-colors duration-150 ${
        isSelected ? "bg-primary/5 border-primary/30" : "border-transparent hover:bg-muted/30"
      }`}
    >
      <CommentMeta
        leading={
          isGeneralScope ? (
            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              general
            </span>
          ) : isFileScope ? (
            <FileNameChip path={annotation.filePath} />
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground">
              {annotation.lineStart === annotation.lineEnd
                ? `L${annotation.lineStart}`
                : `L${annotation.lineStart}-${annotation.lineEnd}`}
              {annotation.tokenText && (
                <span className="ml-1 text-primary/70">{`\`${annotation.tokenText.length > 30 ? annotation.tokenText.slice(0, 27) + "..." : annotation.tokenText}\``}</span>
              )}
            </span>
          )
        }
        conventionalLabel={annotation.conventionalLabel}
        decorations={annotation.decorations}
        reviewProfileLabel={annotation.reviewProfileLabel}
        source={annotation.source}
        author={annotation.author}
        createdAt={annotation.createdAt}
      />
      {annotation.text && (
        <div className="text-xs text-foreground/80 line-clamp-2 review-comment-markdown">
          {renderInlineMarkdown(annotation.text)}
        </div>
      )}
      {annotation.suggestedCode && !isGeneralScope && (
        <div className="mt-1.5">
          <SuggestionPreview
            code={annotation.suggestedCode}
            originalCode={annotation.originalCode}
            language={detectLanguage(annotation.filePath)}
          />
        </div>
      )}
      <CommentActions
        copyText={annotation.text ? commentCopyText(annotation, scope) : undefined}
        onDelete={() => onDeleteAnnotation(annotation.id)}
      />
    </div>
  );
};

interface AnnotationCardsProps {
  annotations: CodeAnnotation[];
  selectedAnnotationId: string | null;
  onNavigateToAnnotation: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;
}

const AnnotationCards: React.FC<AnnotationCardsProps> = ({
  annotations,
  selectedAnnotationId,
  onNavigateToAnnotation,
  onDeleteAnnotation,
}) => (
  <div className="space-y-1">
    {annotations.map((annotation) => (
      <AnnotationCard
        key={annotation.id}
        annotation={annotation}
        isSelected={selectedAnnotationId === annotation.id}
        onNavigateToAnnotation={onNavigateToAnnotation}
        onDeleteAnnotation={onDeleteAnnotation}
      />
    ))}
  </div>
);

interface FileAnnotationGroupProps extends AnnotationCardsProps {
  filePath: string;
  stickyTopClassName?: string;
}

const FileAnnotationGroup: React.FC<FileAnnotationGroupProps> = ({
  filePath,
  stickyTopClassName = "top-0",
  ...annotationCardsProps
}) => (
  <div>
    <div
      className={`sticky ${stickyTopClassName} z-10 bg-background/95 backdrop-blur-sm px-2 py-1 text-xs font-mono text-muted-foreground truncate`}
    >
      {filePath.split("/").pop()}
    </div>
    <AnnotationCards {...annotationCardsProps} />
  </div>
);

function getPRLabel(prUrl: string, fileAnnotations: Map<string, CodeAnnotation[]>): string {
  if (prUrl === "_none") return "Local Changes";

  const sample = Array.from(fileAnnotations.values())[0]?.[0];

  return `${sample?.prRepo ? `${sample.prRepo}` : ""}#${sample?.prNumber ?? "?"} ${sample?.prTitle ?? ""}`;
}

interface PRAnnotationGroupsProps extends AnnotationCardsProps {
  prGroups: Map<string, Map<string, CodeAnnotation[]>>;
}

const PRAnnotationGroups: React.FC<PRAnnotationGroupsProps> = ({
  prGroups,
  ...annotationCardsProps
}) => (
  <>
    {Array.from(prGroups.entries()).map(([prUrl, fileAnnotations]) => (
      <div key={prUrl}>
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm px-2 py-1.5 text-[10px] font-medium text-accent/80 border-b border-border/30 mb-1">
          {getPRLabel(prUrl, fileAnnotations)}
        </div>
        <div className="space-y-4">
          {Array.from(fileAnnotations.entries()).map(([filePath, annotations]) => (
            <FileAnnotationGroup
              key={filePath}
              filePath={filePath}
              annotations={annotations}
              stickyTopClassName="top-7"
              {...annotationCardsProps}
            />
          ))}
        </div>
      </div>
    ))}
  </>
);

const EmptyAnnotations: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-40 text-center px-4">
    <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
      <svg
        className="w-5 h-5 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
        />
      </svg>
    </div>
    <p className="text-xs text-muted-foreground">Click on lines to add annotations</p>
  </div>
);

interface AnnotationsTabProps extends AnnotationCardsProps {
  annotations: CodeAnnotation[];
  annotationGroups: AnnotationGroups;
  editorAnnotations?: EditorAnnotation[];
  onDeleteEditorAnnotation?: (id: string) => void;
}

const AnnotationsTab: React.FC<AnnotationsTabProps> = ({
  annotations,
  annotationGroups,
  editorAnnotations,
  onDeleteEditorAnnotation,
  ...annotationCardsProps
}) => {
  const { generalAnnotations, groupedAnnotations, prGroups, isMultiPR } = annotationGroups;
  const totalCount = annotations.length + (editorAnnotations?.length ?? 0);

  return (
    <div className="p-2 space-y-1.5">
      {totalCount === 0 ? (
        <EmptyAnnotations />
      ) : (
        <div className="p-2 space-y-4">
          {generalAnnotations.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-2 py-1 text-xs font-medium text-muted-foreground">
                General
              </div>
              <AnnotationCards annotations={generalAnnotations} {...annotationCardsProps} />
            </div>
          )}
          {isMultiPR && prGroups ? (
            <PRAnnotationGroups prGroups={prGroups} {...annotationCardsProps} />
          ) : (
            Array.from(groupedAnnotations.entries()).map(([filePath, annotations]) => (
              <FileAnnotationGroup
                key={filePath}
                filePath={filePath}
                annotations={annotations}
                {...annotationCardsProps}
              />
            ))
          )}
        </div>
      )}
      <EditorAnnotations
        annotations={annotations}
        editorAnnotations={editorAnnotations}
        onDeleteEditorAnnotation={onDeleteEditorAnnotation}
      />
    </div>
  );
};

interface EditorAnnotationsProps {
  annotations: CodeAnnotation[];
  editorAnnotations?: EditorAnnotation[];
  onDeleteEditorAnnotation?: (id: string) => void;
}

const EditorAnnotations: React.FC<EditorAnnotationsProps> = ({
  annotations,
  editorAnnotations,
  onDeleteEditorAnnotation,
}) => {
  if (!editorAnnotations || editorAnnotations.length === 0) return null;

  return (
    <>
      {annotations.length > 0 && (
        <div className="flex items-center gap-2 pt-2 pb-1">
          <div className="flex-1 border-t border-border/30" />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Editor
          </span>
          <div className="flex-1 border-t border-border/30" />
        </div>
      )}
      {editorAnnotations.map((annotation) => (
        <EditorAnnotationCard
          key={annotation.id}
          annotation={annotation}
          variant="code-review"
          onDelete={() => onDeleteEditorAnnotation?.(annotation.id)}
        />
      ))}
    </>
  );
};

interface SidebarHeaderProps {
  activeTab: ReviewSidebarTab;
  annotationCount: number;
  aiMessageCount: number;
}

const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  activeTab,
  annotationCount,
  aiMessageCount,
}) => {
  const count = activeTab === "annotations" ? annotationCount : aiMessageCount;

  return (
    <div
      className="px-3 flex items-center border-b border-border/50"
      style={{ height: "var(--panel-header-h)" }}
    >
      <div className="flex items-center gap-2 w-full min-w-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {activeTab === "annotations" ? "Annotations" : "AI"}
        </h2>
        {count > 0 && (
          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            {count}
          </span>
        )}
      </div>
    </div>
  );
};

interface QuickCopyFooterProps {
  copied: boolean;
  onCopy: () => void;
}

const QuickCopyFooter: React.FC<QuickCopyFooterProps> = ({ copied, onCopy }) => (
  <div className="p-2 border-t border-border/50">
    <button
      onClick={onCopy}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-xs font-medium transition-all text-muted-foreground hover:text-foreground hover:bg-muted/50"
    >
      {copied ? <CopiedFeedbackIcon /> : <CopyFeedbackIcon />}
      {copied ? "Copied" : "Copy Feedback"}
    </button>
  </div>
);

const CopiedFeedbackIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5 text-success"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const CopyFeedbackIcon: React.FC = () => (
  <svg
    className="w-3.5 h-3.5"
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
);

export const ReviewSidebar: React.FC<ReviewSidebarProps> = /* React.memo */ ({
  isOpen,
  _onClose,
  activeTab,
  annotations,
  _files,
  selectedAnnotationId,
  _onSelectAnnotation,
  onNavigateToAnnotation,
  onDeleteAnnotation,
  feedbackMarkdown,
  width,
  editorAnnotations,
  onDeleteEditorAnnotation,
  _prMetadata,
  _aiAvailable = false,
  aiMessages = [],
  isAICreatingSession = false,
  isAIStreaming = false,
  onScrollToAILines,
  activeFilePath,
  scrollToQuestionId,
  onAskChat,
  pendingAIContext,
  aiComposerFocusToken,
  onRemovePendingAIContext,
  aiPermissionRequests = [],
  onRespondToPermission,
  aiProviders,
  aiConfig,
  onAIConfigChange,
  hasAISession,
  _onOpenPRPanel,
}) => {
  const { copied, copyFeedback } = useQuickCopyFeedback(feedbackMarkdown);
  const annotationGroups = useAnnotationGroups(annotations);
  const totalAnnotationCount = annotations.length + (editorAnnotations?.length ?? 0);

  if (!isOpen) return null;

  return (
    <aside
      className="border-l border-border/50 bg-card/30 backdrop-blur-sm flex flex-col flex-shrink-0"
      style={{ width: width ?? 288 }}
    >
      <SidebarHeader
        activeTab={activeTab}
        annotationCount={totalAnnotationCount}
        aiMessageCount={aiMessages.length}
      />
      <OverlayScrollArea className="flex-1 min-h-0">
        {activeTab === "annotations" ? (
          <AnnotationsTab
            annotations={annotations}
            annotationGroups={annotationGroups}
            selectedAnnotationId={selectedAnnotationId}
            onNavigateToAnnotation={onNavigateToAnnotation}
            onDeleteAnnotation={onDeleteAnnotation}
            editorAnnotations={editorAnnotations}
            onDeleteEditorAnnotation={onDeleteEditorAnnotation}
          />
        ) : (
          <AITab
            messages={aiMessages}
            isCreatingSession={isAICreatingSession}
            isStreaming={isAIStreaming}
            activeFilePath={activeFilePath}
            scrollToQuestionId={scrollToQuestionId}
            onScrollToLines={onScrollToAILines ?? (() => {})}
            onAskChat={onAskChat}
            pendingAIContext={pendingAIContext}
            aiComposerFocusToken={aiComposerFocusToken}
            onRemovePendingAIContext={onRemovePendingAIContext}
            permissionRequests={aiPermissionRequests}
            onRespondToPermission={onRespondToPermission}
            aiProviders={aiProviders}
            aiConfig={aiConfig}
            onAIConfigChange={onAIConfigChange}
            hasAISession={hasAISession}
          />
        )}
      </OverlayScrollArea>
      {activeTab === "annotations" && feedbackMarkdown && totalAnnotationCount > 0 && (
        <QuickCopyFooter copied={copied} onCopy={copyFeedback} />
      )}
    </aside>
  );
};
