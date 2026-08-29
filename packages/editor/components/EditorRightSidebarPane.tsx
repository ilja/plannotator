import { AnnotationPanel } from "@plannotator/ui/components/AnnotationPanel";
import { DocumentAIChatPanel } from "@plannotator/ui/components/ai/DocumentAIChatPanel";
import { ResizeHandle } from "@plannotator/ui/components/ResizeHandle";
import { SparklesIcon } from "@plannotator/ui/components/SparklesIcon";
import type { AIChatEntry, PendingPermission } from "@plannotator/ui/hooks/useAIChat";
import type { AIProviderOption } from "@plannotator/ui/utils/aiProvider";
import type { Annotation, Block, CodeAnnotation, EditorAnnotation } from "@plannotator/ui/types";
import type { CSSProperties, PointerEvent } from "react";

/** The currently visible feedback sidebar. */
export type EditorRightSidebarTab = "annotations" | "ai";

/** Read-only direct-edit data displayed in the annotation timeline. */
export interface EditorDirectEditsPanelItem {
  readonly id: string;
  readonly title?: string;
  readonly label?: string;
  readonly added: number;
  readonly removed: number;
  readonly diffText: string;
  readonly description?: string;
}

/** Read-only data for the editor feedback sidebar. */
export interface EditorRightSidebarModel {
  readonly isOpen: boolean;
  readonly activeTab: EditorRightSidebarTab;
  readonly isWideMode: boolean;
  readonly canUseAskAI: boolean;
  readonly isMobile: boolean;
  readonly width: number;
  readonly isResizeDragging: boolean;
  readonly resizeHandleStyle: CSSProperties;
  readonly blocks: Block[];
  readonly annotations: Annotation[];
  readonly selectedAnnotationId: string | null;
  readonly selectedCodeAnnotationId: string | null;
  readonly codeAnnotations: CodeAnnotation[];
  readonly sharingEnabled: boolean;
  readonly editorAnnotations: EditorAnnotation[];
  readonly otherFileAnnotations: { count: number; files: number } | undefined;
  readonly directEdits: EditorDirectEditsPanelItem[] | null;
  readonly aiMessages: AIChatEntry[];
  readonly aiIsCreatingSession: boolean;
  readonly aiIsStreaming: boolean;
  readonly aiPermissionRequests: PendingPermission[];
  readonly aiProviders: AIProviderOption[];
  readonly aiConfig: {
    providerId: string | null;
    model: string | null;
    reasoningEffort?: string | null;
  };
  readonly isAgentTerminalReady: boolean;
}

/** User actions exposed by the editor feedback sidebar. */
export interface EditorRightSidebarActions {
  readonly onClose: () => void;
  readonly onResizePointerDown: (event: PointerEvent) => void;
  readonly onResizeDoubleClick: () => void;
  readonly onSelectAnnotation: (id: string) => void;
  readonly onDeleteAnnotation: (id: string) => void;
  readonly onEditAnnotation: (id: string, updates: Partial<Annotation>) => void;
  readonly onSelectCodeAnnotation: (id: string) => void;
  readonly onDeleteCodeAnnotation: (id: string) => void;
  readonly onEditCodeAnnotation: (id: string, updates: Partial<CodeAnnotation>) => void;
  readonly onDeleteEditorAnnotation: (id: string) => void;
  readonly onQuickCopy: () => Promise<void>;
  readonly onOpenShareExport: () => void;
  readonly onShowAnnotatedFiles: () => void;
  readonly onDiscardPlanEdits: () => void;
  readonly onAskGeneralAI: (question: string) => void;
  readonly onRespondToAIPermission: (requestId: string, allow: boolean) => void;
  readonly onAIConfigChange: (config: {
    providerId?: string | null;
    model?: string | null;
    reasoningEffort?: string | null;
  }) => void;
}

/** Renders the annotation timeline or document AI chat beside the editor workspace. */
export function EditorRightSidebarPane({
  model,
  actions,
}: {
  readonly model: EditorRightSidebarModel;
  readonly actions: EditorRightSidebarActions;
}) {
  if (model.isWideMode) return null;

  return (
    <div className="contents group/sidebar">
      {model.isOpen && (model.activeTab === "annotations" || model.canUseAskAI) && (
        <ResizeHandle
          isDragging={model.isResizeDragging}
          onPointerDown={actions.onResizePointerDown}
          onDoubleClick={actions.onResizeDoubleClick}
          style={model.resizeHandleStyle}
          className="hidden md:block z-[55]"
          side="right"
          onCollapse={actions.onClose}
        />
      )}
      <EditorAnnotationSidebar model={model} actions={actions} />
      <EditorAIChatSidebar model={model} actions={actions} />
    </div>
  );
}

function EditorAnnotationSidebar({
  model,
  actions,
}: {
  readonly model: EditorRightSidebarModel;
  readonly actions: EditorRightSidebarActions;
}) {
  const isOpen = model.isOpen && model.activeTab === "annotations";
  const directEdits = model.directEdits?.map((item) => ({
    id: item.id,
    title: item.title,
    label: item.label,
    added: item.added,
    removed: item.removed,
    diffText: item.diffText,
    description: item.description,
    onDiscard: item.id === "plan" ? actions.onDiscardPlanEdits : undefined,
  }));

  return (
    <AnnotationPanel
      isOpen={isOpen}
      blocks={model.blocks}
      annotations={model.annotations}
      selectedId={model.selectedAnnotationId ?? model.selectedCodeAnnotationId}
      onSelect={actions.onSelectAnnotation}
      onDelete={actions.onDeleteAnnotation}
      onEdit={actions.onEditAnnotation}
      codeAnnotations={model.codeAnnotations}
      onSelectCodeAnnotation={actions.onSelectCodeAnnotation}
      onDeleteCodeAnnotation={actions.onDeleteCodeAnnotation}
      onEditCodeAnnotation={actions.onEditCodeAnnotation}
      sharingEnabled={model.sharingEnabled}
      width={`var(--rpanel-w, ${model.width}px)`}
      editorAnnotations={model.editorAnnotations}
      onDeleteEditorAnnotation={actions.onDeleteEditorAnnotation}
      onClose={actions.onClose}
      onQuickCopy={actions.onQuickCopy}
      onShare={model.sharingEnabled ? actions.onOpenShareExport : undefined}
      otherFileAnnotations={model.otherFileAnnotations}
      directEdits={directEdits}
      onOtherFileAnnotationsClick={actions.onShowAnnotatedFiles}
    />
  );
}

function EditorAIChatSidebar({
  model,
  actions,
}: {
  readonly model: EditorRightSidebarModel;
  readonly actions: EditorRightSidebarActions;
}) {
  if (!model.isOpen || model.activeTab !== "ai" || !model.canUseAskAI) return null;

  return (
    <aside
      data-annotation-panel="true"
      className={`border-l border-border/50 bg-card flex flex-col flex-shrink-0 ${
        model.isMobile ? "fixed top-12 bottom-0 right-0 z-[60] w-full max-w-sm shadow-2xl" : ""
      }`}
      style={model.isMobile ? undefined : { width: `var(--rpanel-w, ${model.width ?? 288}px)` }}
    >
      <EditorAIChatHeader
        messageCount={model.aiMessages.length}
        isMobile={model.isMobile}
        onClose={actions.onClose}
      />
      <DocumentAIChatPanel
        messages={model.aiMessages}
        isCreatingSession={model.isAgentTerminalReady ? false : model.aiIsCreatingSession}
        isStreaming={model.isAgentTerminalReady ? false : model.aiIsStreaming}
        onAskGeneral={actions.onAskGeneralAI}
        permissionRequests={model.isAgentTerminalReady ? [] : model.aiPermissionRequests}
        onRespondToPermission={
          model.isAgentTerminalReady ? undefined : actions.onRespondToAIPermission
        }
        aiProviders={model.aiProviders}
        aiConfig={model.aiConfig}
        onAIConfigChange={model.isAgentTerminalReady ? undefined : actions.onAIConfigChange}
      />
    </aside>
  );
}

function EditorAIChatHeader({
  messageCount,
  isMobile,
  onClose,
}: {
  readonly messageCount: number;
  readonly isMobile: boolean;
  readonly onClose: () => void;
}) {
  return (
    <div className="border-b border-border/50">
      <div className="flex h-10 items-center justify-between px-3">
        <div className="flex items-center gap-2 min-w-0">
          <SparklesIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <h2 className="text-xs font-medium text-foreground">AI</h2>
          {messageCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary/10 px-1 font-mono text-[10px] font-medium tabular-nums text-primary">
              {messageCount}
            </span>
          )}
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            className="relative rounded-md p-1.5 text-muted-foreground transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:text-foreground md:hidden"
            title="Close panel"
            aria-label="Close AI panel"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
