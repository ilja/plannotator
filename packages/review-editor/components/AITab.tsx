import React, { useRef, useEffect, useState, useMemo, memo } from "react";
import type { AIChatEntry, PendingPermission } from "../hooks/useAIChat";
import { renderChatMarkdown } from "../utils/renderChatMarkdown";
import { formatLineRange } from "../utils/formatLineRange";
import { formatRelativeTime } from "../utils/formatRelativeTime";
import { FileNameChip } from "./FileNameChip";
import { SparklesIcon } from "@plannotator/ui/components/SparklesIcon";
import { CountBadge } from "./CountBadge";
import { CopyButton } from "./CopyButton";
import { PermissionCard } from "./PermissionCard";
import { AIConfigBar } from "./AIConfigBar";
import { OverlayScrollArea } from "@plannotator/ui/components/OverlayScrollArea";
import type { AIProviderOption } from "@plannotator/ui/utils/aiProvider";
import { AIChatComposer } from "./AIChatComposer";
import type { PendingAIContext } from "../utils/pendingAIContext";

interface AITabProps {
  messages: AIChatEntry[];
  isCreatingSession: boolean;
  isStreaming: boolean;
  activeFilePath?: string;
  scrollToQuestionId?: string | null;
  onScrollToLines: (
    filePath: string,
    lineStart: number,
    lineEnd: number,
    side: "old" | "new",
  ) => void;
  onAskChat?: (question: string) => void;
  pendingAIContext?: PendingAIContext | null;
  aiComposerFocusToken?: number;
  onRemovePendingAIContext?: () => void;
  permissionRequests?: PendingPermission[];
  onRespondToPermission?: (requestId: string, allow: boolean) => void;
  aiProviders?: AIProviderOption[];
  aiConfig?: { providerId: string | null; model: string | null; reasoningEffort?: string | null };
  onAIConfigChange?: (config: {
    providerId?: string | null;
    model?: string | null;
    reasoningEffort?: string | null;
  }) => void;
  hasAISession?: boolean;
}

interface FileGroup {
  filePath: string;
  messages: AIChatEntry[];
}

function getQuestionScope(q: AIChatEntry["question"]): "general" | "file" | "line" {
  if (!q.filePath) return "general";
  if (q.lineStart == null) return "file";
  return "line";
}

function ignorePermissionResponse(_requestId: string, _allow: boolean) {}

function ignorePendingAIContextRemoval() {}

export const AITab: React.FC<AITabProps> = ({
  messages,
  isCreatingSession,
  isStreaming,
  activeFilePath,
  scrollToQuestionId,
  onScrollToLines,
  onAskChat,
  pendingAIContext = null,
  aiComposerFocusToken = 0,
  onRemovePendingAIContext,
  permissionRequests = [],
  onRespondToPermission,
  aiProviders = [],
  aiConfig,
  onAIConfigChange,
  hasAISession = false,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [generalInput, setGeneralInput] = useState("");
  const [highlightFilePath, setHighlightFilePath] = useState<string | null>(null);

  // Group messages by file
  const { fileGroups, generalMessages } = useMemo(() => {
    const grouped = new Map<string, AIChatEntry[]>();
    const general: AIChatEntry[] = [];

    for (const msg of messages) {
      if (!msg.question.filePath) {
        general.push(msg);
      } else {
        const existing = grouped.get(msg.question.filePath) || [];
        existing.push(msg);
        grouped.set(msg.question.filePath, existing);
      }
    }

    const fileGroups: FileGroup[] = [];
    for (const [filePath, msgs] of grouped) {
      msgs.sort((a, b) => {
        const aScope = getQuestionScope(a.question);
        const bScope = getQuestionScope(b.question);
        if (aScope !== bScope) return aScope === "file" ? -1 : 1;
        return (a.question.lineStart ?? 0) - (b.question.lineStart ?? 0);
      });
      fileGroups.push({ filePath, messages: msgs });
    }

    return { fileGroups, generalMessages: general };
  }, [messages]);

  // Auto-expand active file's group
  useEffect(() => {
    if (activeFilePath) {
      setExpandedFiles((prev) => {
        if (prev.has(activeFilePath)) return prev;
        const next = new Set(prev);
        next.add(activeFilePath);
        return next;
      });
    }
  }, [activeFilePath]);

  // Scroll to specific question and flash-highlight its file group header
  useEffect(() => {
    if (!scrollToQuestionId || !scrollRef.current) return;

    const msg = messages.find((m) => m.question.id === scrollToQuestionId);
    const filePath = msg?.question.filePath;

    if (filePath) {
      const header = scrollRef.current.querySelector(`[data-file-group="${CSS.escape(filePath)}"]`);
      if (header) {
        header.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setHighlightFilePath(filePath);
      setTimeout(() => setHighlightFilePath(null), 1200);
    }

    if (filePath && expandedFiles.has(filePath)) {
      setTimeout(() => {
        const el = scrollRef.current?.querySelector(`[data-question-id="${scrollToQuestionId}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [scrollToQuestionId]);

  // Auto-scroll when new messages arrive or the latest response streams in.
  const latestMessage = messages[messages.length - 1];
  const latestResponseText = latestMessage?.response.text ?? "";
  useEffect(() => {
    if (!scrollRef.current) return;
    if (latestMessage) {
      const latestQA = scrollRef.current.querySelector(
        `[data-question-id="${CSS.escape(latestMessage.question.id)}"]`,
      );
      latestQA?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [latestMessage?.question.id, latestResponseText, messages.length]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const handleChatSubmit = () => {
    if (!generalInput.trim() || !onAskChat) return;
    onAskChat(generalInput.trim());
    setGeneralInput("");
  };

  // Empty state
  if (messages.length === 0 && !isCreatingSession) {
    return (
      <EmptyAITabState
        aiProviders={aiProviders}
        aiConfig={aiConfig}
        onAIConfigChange={onAIConfigChange}
        hasAISession={hasAISession}
        onAskChat={onAskChat}
        generalInput={generalInput}
        pendingAIContext={pendingAIContext}
        aiComposerFocusToken={aiComposerFocusToken}
        onGeneralInputChange={setGeneralInput}
        onSubmit={handleChatSubmit}
        onRemovePendingAIContext={onRemovePendingAIContext}
        isStreaming={isStreaming}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <OverlayScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-2">
          {isCreatingSession && messages.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">
              <span className="ai-streaming-cursor" /> Starting AI session...
            </div>
          )}

          {/* File-grouped questions */}
          <FileQuestionGroups
            fileGroups={fileGroups}
            expandedFiles={expandedFiles}
            highlightFilePath={highlightFilePath}
            onToggleFile={toggleFile}
            onScrollToLines={onScrollToLines}
          />

          {/* Pending permission requests */}
          <PendingPermissionRequests
            permissionRequests={permissionRequests}
            onRespondToPermission={onRespondToPermission}
          />

          {/* General questions */}
          <GeneralQuestions
            messages={generalMessages}
            hasFileGroups={fileGroups.length > 0}
            onScrollToLines={onScrollToLines}
          />
        </div>
      </OverlayScrollArea>

      {/* Config bar */}
      <AIControls
        aiProviders={aiProviders}
        aiConfig={aiConfig}
        onAIConfigChange={onAIConfigChange}
        hasAISession={hasAISession}
        onAskChat={onAskChat}
        generalInput={generalInput}
        pendingAIContext={pendingAIContext}
        aiComposerFocusToken={aiComposerFocusToken}
        onGeneralInputChange={setGeneralInput}
        onSubmit={handleChatSubmit}
        onRemovePendingAIContext={onRemovePendingAIContext}
        isStreaming={isStreaming}
      />
    </div>
  );
};

function EmptyAITabState(props: AIControlsProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-4 py-12 text-center">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
          <SparklesIcon className="w-5 h-5" />
        </div>
        <p className="text-xs">
          Hover a line and click the sparkle to attach it, or ask a question below.
        </p>
      </div>
      <AIControls {...props} />
    </div>
  );
}

interface FileQuestionGroupsProps {
  fileGroups: FileGroup[];
  expandedFiles: Set<string>;
  highlightFilePath: string | null;
  onToggleFile: (filePath: string) => void;
  onScrollToLines: AITabProps["onScrollToLines"];
}

function FileQuestionGroups({
  fileGroups,
  expandedFiles,
  highlightFilePath,
  onToggleFile,
  onScrollToLines,
}: FileQuestionGroupsProps) {
  return fileGroups.map(({ filePath, messages }) => (
    <FileQuestionGroup
      key={filePath}
      filePath={filePath}
      messages={messages}
      isExpanded={expandedFiles.has(filePath)}
      isHighlighted={highlightFilePath === filePath}
      onToggleFile={onToggleFile}
      onScrollToLines={onScrollToLines}
    />
  ));
}

interface FileQuestionGroupProps {
  filePath: string;
  messages: AIChatEntry[];
  isExpanded: boolean;
  isHighlighted: boolean;
  onToggleFile: (filePath: string) => void;
  onScrollToLines: AITabProps["onScrollToLines"];
}

function FileQuestionGroup({
  filePath,
  messages,
  isExpanded,
  isHighlighted,
  onToggleFile,
  onScrollToLines,
}: FileQuestionGroupProps) {
  const basename = filePath.split("/").pop() || filePath;

  return (
    <div className="mb-1">
      <button
        data-file-group={filePath}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors ${isHighlighted ? "ai-file-group-highlight" : ""}`}
        onClick={() => onToggleFile(filePath)}
      >
        <svg
          className={`w-3 h-3 text-muted-foreground/50 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="truncate text-foreground font-medium">{basename}</span>
        <CountBadge
          count={messages.length}
          className="ml-auto flex-shrink-0 text-muted-foreground/50"
        />
      </button>
      {isExpanded && (
        <div className="ml-3 border-l border-border/30 pl-2 space-y-2 mt-1">
          {messages.map(({ question, response }) => (
            <QAPair
              key={question.id}
              question={question}
              response={response}
              onScrollToLines={onScrollToLines}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PendingPermissionRequestsProps {
  permissionRequests: PendingPermission[];
  onRespondToPermission: AITabProps["onRespondToPermission"];
}

function PendingPermissionRequests({
  permissionRequests,
  onRespondToPermission,
}: PendingPermissionRequestsProps) {
  return permissionRequests
    .filter((request) => !request.decided)
    .map((request) => (
      <div key={request.requestId} className="mb-2">
        <PermissionCard
          requestId={request.requestId}
          toolName={request.toolName}
          toolInput={request.toolInput}
          title={request.title}
          displayName={request.displayName}
          description={request.description}
          onRespond={onRespondToPermission ?? ignorePermissionResponse}
        />
      </div>
    ));
}

interface GeneralQuestionsProps {
  messages: AIChatEntry[];
  hasFileGroups: boolean;
  onScrollToLines: AITabProps["onScrollToLines"];
}

function GeneralQuestions({ messages, hasFileGroups, onScrollToLines }: GeneralQuestionsProps) {
  if (messages.length === 0) return null;

  return (
    <div className="mb-3 mt-2">
      {hasFileGroups && (
        <div className="flex items-center gap-2 px-2 mb-1.5">
          <div className="flex-1 border-t border-border/40" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            General
          </span>
          <div className="flex-1 border-t border-border/40" />
        </div>
      )}
      <div className="space-y-2">
        {messages.map(({ question, response }) => (
          <QAPair
            key={question.id}
            question={question}
            response={response}
            onScrollToLines={onScrollToLines}
          />
        ))}
      </div>
    </div>
  );
}

interface AIControlsProps {
  aiProviders: AIProviderOption[];
  aiConfig: AITabProps["aiConfig"];
  onAIConfigChange: AITabProps["onAIConfigChange"];
  hasAISession: boolean;
  onAskChat: AITabProps["onAskChat"];
  generalInput: string;
  pendingAIContext: PendingAIContext | null;
  aiComposerFocusToken: number;
  onGeneralInputChange: (value: string) => void;
  onSubmit: () => void;
  onRemovePendingAIContext: AITabProps["onRemovePendingAIContext"];
  isStreaming: boolean;
}

function AIControls({
  aiProviders,
  aiConfig,
  onAIConfigChange,
  hasAISession,
  onAskChat,
  generalInput,
  pendingAIContext,
  aiComposerFocusToken,
  onGeneralInputChange,
  onSubmit,
  onRemovePendingAIContext,
  isStreaming,
}: AIControlsProps) {
  return (
    <>
      <AIConfigBar
        providers={aiProviders}
        selectedProviderId={aiConfig?.providerId ?? null}
        selectedModel={aiConfig?.model ?? null}
        onProviderChange={(providerId) => onAIConfigChange?.({ providerId })}
        onModelChange={(model) => onAIConfigChange?.({ model })}
        selectedReasoningEffort={aiConfig?.reasoningEffort ?? null}
        onReasoningEffortChange={(effort) => onAIConfigChange?.({ reasoningEffort: effort })}
        hasSession={hasAISession}
      />
      {onAskChat && (
        <AIChatComposer
          value={generalInput}
          pendingContext={pendingAIContext}
          focusToken={aiComposerFocusToken}
          onChange={onGeneralInputChange}
          onSubmit={onSubmit}
          onRemoveContext={onRemovePendingAIContext ?? ignorePendingAIContextRemoval}
          disabled={isStreaming}
          isStreaming={isStreaming}
        />
      )}
    </>
  );
}

/** Single Q&A pair — memoized to avoid re-parsing markdown on sibling updates */
const QAPair = memo<{
  question: AIChatEntry["question"];
  response: AIChatEntry["response"];
  onScrollToLines: AITabProps["onScrollToLines"];
}>(({ question, response, onScrollToLines }) => {
  const scope = getQuestionScope(question);
  const renderedResponse = useMemo(
    () => (response.text ? renderChatMarkdown(response.text) : null),
    [response.text],
  );

  return (
    <div data-question-id={question.id} className="flex flex-col gap-1.5">
      {/* Question */}
      <div className="p-2.5 rounded-lg border border-transparent hover:bg-muted/30 transition-colors">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {scope === "line" &&
              question.filePath &&
              question.lineStart != null &&
              question.lineEnd != null && (
                <button
                  className="ai-line-ref"
                  onClick={() =>
                    onScrollToLines(
                      question.filePath!,
                      question.lineStart!,
                      question.lineEnd!,
                      question.side ?? "new",
                    )
                  }
                >
                  {formatLineRange(question.lineStart, question.lineEnd)}
                </button>
              )}
            {scope === "file" && question.filePath && <FileNameChip path={question.filePath} />}
          </div>
          <span className="text-[10px] text-muted-foreground/50">
            {formatRelativeTime(question.createdAt)}
          </span>
        </div>
        <p className="text-xs text-foreground/80">{question.prompt}</p>
      </div>

      {/* Response */}
      <div className="group relative p-2.5 rounded-lg border border-border/50 bg-popover/50 hover:bg-muted/30 transition-colors">
        {response.error ? (
          <p className="text-xs text-destructive">{response.error}</p>
        ) : response.text ? (
          <>
            <div className="text-xs review-comment-body">
              {renderedResponse}
              {response.isStreaming && <span className="ai-streaming-cursor inline-block ml-0.5" />}
            </div>
            {!response.isStreaming && <CopyButton text={response.text} />}
          </>
        ) : response.isStreaming ? (
          <span className="text-xs text-muted-foreground">
            <span className="ai-streaming-cursor" /> Thinking...
          </span>
        ) : null}
      </div>
    </div>
  );
});
