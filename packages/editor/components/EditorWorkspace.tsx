import type { CSSProperties, PointerEvent, RefObject } from "react";
import type { CommentAskAIHandler } from "@plannotator/ui/components/CommentPopover";
import { ScrollViewportContext } from "@plannotator/ui/hooks/useScrollViewport";
import type { ViewerHandle } from "@plannotator/ui/components/Viewer";
import type { Frontmatter } from "@plannotator/ui/utils/parser";
import type {
  ActionsLabelMode,
  Annotation,
  Block,
  EditorMode,
  ImageAttachment,
  InputMethod,
} from "@plannotator/ui/types";
import type { SourceBackedDocumentSaveStatus } from "../sourceBackedDocuments";
import {
  AnnotateAgentTerminalPanel,
  type AnnotateAgentTerminalPanelHandle,
} from "./AnnotateAgentTerminalPanel";
import { EditorDocumentSurface } from "./EditorDocumentSurface";
import {
  EditorLeftSidebarPane,
  type EditorLeftSidebarActions,
  type EditorLeftSidebarModel,
} from "./EditorLeftSidebarPane";
import {
  EditorRightSidebarPane,
  type EditorRightSidebarActions,
  type EditorRightSidebarModel,
} from "./EditorRightSidebarPane";
import { ResizeHandle } from "@plannotator/ui/components/ResizeHandle";
import type { AgentTerminalCapability } from "@plannotator/shared/agent-terminal";
import type { LinkedDocBadgeInfo } from "@plannotator/ui/components/DocBadges";
import type { MarkdownEditorHandle } from "@plannotator/ui/components/MarkdownEditor";

/** Read-only data needed by the unchanged document surface. */
export interface EditorWorkspaceDocumentModel {
  readonly isHtmlSurface: boolean;
  readonly gridEnabled: boolean;
  readonly sidebarIsOpen: boolean;
  readonly agentTerminalIsOpen: boolean;
  readonly wideModeType: "wide" | "focus" | null;
  readonly isEditingMarkdown: boolean;
  readonly htmlToolsHidden: boolean;
  readonly stickyActionsEnabled: boolean;
  readonly inputMethod: InputMethod;
  readonly editorMode: EditorMode;
  readonly repoInfo: { display: string; branch?: string; host?: string } | null;
  readonly readerMaxWidth: number | null;
  readonly viewerContentKey: string;
  readonly showEmptyFolderPresentation: boolean;
  readonly canUseWideMode: boolean;
  readonly canEditMarkdown: boolean;
  readonly activeSourceSaveFileName: string | null;
  readonly activeSaveStatus: SourceBackedDocumentSaveStatus | undefined;
  readonly saveFailed: boolean;
  readonly emphasizeSave: boolean;
  readonly hasUnsavedDiskChanges: boolean;
  readonly cancelMode: boolean;
  readonly confirmCancelEdits: boolean;
  readonly planAreaRef: RefObject<HTMLDivElement | null>;
  readonly renderAs: "markdown" | "html";
  readonly rawHtml: string;
  readonly displayedMarkdown: string;
  readonly blocks: Block[];
  readonly frontmatter: Frontmatter | null;
  readonly annotations: Annotation[];
  readonly selectedAnnotationId: string | null;
  readonly globalAttachments: ImageAttachment[];
  readonly activeSourceDocumentKey: string | null;
  readonly editGeneration: number;
  readonly viewerRef: RefObject<ViewerHandle | null>;
  readonly showDemoBadge: boolean;
  readonly linkedDocument: LinkedDocBadgeInfo | null;
  readonly imageBaseDir: string | undefined;
  readonly codePathBaseDir: string | undefined;
  readonly copyLabel: string | undefined;
  readonly sourceInfo: string | undefined;
  readonly openInAppPath: string | null;
  readonly messagePickerInfo: { current: number; total: number } | undefined;
  readonly checkboxOverrides: Map<string, boolean>;
  readonly actionsLabelMode: ActionsLabelMode;
  readonly typographyStyle: CSSProperties;
}

/** Document interactions owned by App and called from the workspace. */
export interface EditorWorkspaceDocumentActions {
  readonly onViewportReady: (viewport: HTMLElement | null) => void;
  readonly onInputMethodChange: (method: InputMethod) => void;
  readonly onEditorModeChange: (mode: EditorMode) => void;
  readonly onToggleViewMode: (type: "wide" | "focus") => void;
  readonly onSaveSourceFile: () => void;
  readonly onEditExit: () => void;
  readonly onAddAnnotation: (annotation: Annotation) => void;
  readonly onRemoveAnnotation: (annotationId: string) => void;
  readonly onSelectAnnotation: (annotationId: string | null) => void;
  readonly onAddGlobalAttachment: (image: ImageAttachment) => void;
  readonly onRemoveGlobalAttachment: (path: string) => void;
  readonly onEditorHandleReady: (handle: MarkdownEditorHandle | null) => void;
  readonly onMarkdownChange: (markdown: string) => void;
  readonly onOpenLinkedDocument: (path: string) => void;
  readonly onOpenCodeFile: (path: string) => void;
  readonly onOpenMessagePicker: () => void;
  readonly onToggleCheckbox: (blockId: string, checked: boolean) => void;
  readonly onAskAI: CommentAskAIHandler | undefined;
}

/** Read-only state for the embedded agent terminal pane. */
export interface EditorWorkspaceTerminalModel {
  readonly shouldRender: boolean;
  readonly isOpen: boolean;
  readonly capability: AgentTerminalCapability | null;
  readonly panelRef: RefObject<AnnotateAgentTerminalPanelHandle | null>;
  readonly width: number;
  readonly isResizeDragging: boolean;
  readonly resizeHandleStyle: CSSProperties;
}

/** Terminal interactions retained by App. */
export interface EditorWorkspaceTerminalActions {
  readonly onSessionActiveChange: (isActive: boolean) => void;
  readonly onSessionReadyChange: (isReady: boolean) => void;
  readonly onClose: () => void;
  readonly onResizePointerDown: (event: PointerEvent) => void;
  readonly onResizeDoubleClick: () => void;
}

/** Read-only models for every pane in the editor workspace. */
export interface EditorWorkspaceModel {
  readonly scrollViewport: HTMLElement | null;
  readonly isResizing: boolean;
  readonly terminal: EditorWorkspaceTerminalModel;
  readonly leftSidebar: EditorLeftSidebarModel;
  readonly document: EditorWorkspaceDocumentModel;
  readonly rightSidebar: EditorRightSidebarModel;
}

/** Pane actions retained by App for the editor workspace. */
export interface EditorWorkspaceActions {
  readonly terminal: EditorWorkspaceTerminalActions;
  readonly leftSidebar: EditorLeftSidebarActions;
  readonly document: EditorWorkspaceDocumentActions;
  readonly rightSidebar: EditorRightSidebarActions;
}

/** Composes the terminal, navigation, document, and feedback panes for the editor workspace. */
export function EditorWorkspace({
  model,
  actions,
}: {
  readonly model: EditorWorkspaceModel;
  readonly actions: EditorWorkspaceActions;
}) {
  return (
    <ScrollViewportContext.Provider value={model.scrollViewport}>
      <div
        data-print-region="content"
        className={`flex-1 flex overflow-hidden relative z-0 ${model.isResizing ? "select-none" : ""}`}
      >
        <EditorAgentTerminal model={model.terminal} actions={actions.terminal} />
        <EditorLeftSidebarPane model={model.leftSidebar} actions={actions.leftSidebar} />
        <EditorDocumentSurface
          isHtmlSurface={model.document.isHtmlSurface}
          gridEnabled={model.document.gridEnabled}
          sidebarIsOpen={model.document.sidebarIsOpen}
          agentTerminalIsOpen={model.document.agentTerminalIsOpen}
          wideModeType={model.document.wideModeType}
          isEditingMarkdown={model.document.isEditingMarkdown}
          htmlToolsHidden={model.document.htmlToolsHidden}
          stickyActionsEnabled={model.document.stickyActionsEnabled}
          inputMethod={model.document.inputMethod}
          editorMode={model.document.editorMode}
          repoInfo={model.document.repoInfo}
          readerMaxWidth={model.document.readerMaxWidth}
          viewerContentKey={model.document.viewerContentKey}
          showEmptyFolderPresentation={model.document.showEmptyFolderPresentation}
          canUseWideMode={model.document.canUseWideMode}
          canEditMarkdown={model.document.canEditMarkdown}
          activeSourceSaveFileName={model.document.activeSourceSaveFileName}
          activeSaveStatus={model.document.activeSaveStatus}
          saveFailed={model.document.saveFailed}
          emphasizeSave={model.document.emphasizeSave}
          hasUnsavedDiskChanges={model.document.hasUnsavedDiskChanges}
          cancelMode={model.document.cancelMode}
          confirmCancelEdits={model.document.confirmCancelEdits}
          planAreaRef={model.document.planAreaRef}
          onViewportReady={actions.document.onViewportReady}
          onInputMethodChange={actions.document.onInputMethodChange}
          onEditorModeChange={actions.document.onEditorModeChange}
          onToggleViewMode={actions.document.onToggleViewMode}
          onSaveSourceFile={actions.document.onSaveSourceFile}
          onEditExit={actions.document.onEditExit}
          renderAs={model.document.renderAs}
          rawHtml={model.document.rawHtml}
          displayedMarkdown={model.document.displayedMarkdown}
          blocks={model.document.blocks}
          frontmatter={model.document.frontmatter}
          annotations={model.document.annotations}
          selectedAnnotationId={model.document.selectedAnnotationId}
          globalAttachments={model.document.globalAttachments}
          activeSourceDocumentKey={model.document.activeSourceDocumentKey}
          editGeneration={model.document.editGeneration}
          viewerRef={model.document.viewerRef}
          showDemoBadge={model.document.showDemoBadge}
          linkedDocument={model.document.linkedDocument}
          imageBaseDir={model.document.imageBaseDir}
          codePathBaseDir={model.document.codePathBaseDir}
          copyLabel={model.document.copyLabel}
          sourceInfo={model.document.sourceInfo}
          openInAppPath={model.document.openInAppPath}
          messagePickerInfo={model.document.messagePickerInfo}
          checkboxOverrides={model.document.checkboxOverrides}
          actionsLabelMode={model.document.actionsLabelMode}
          typographyStyle={model.document.typographyStyle}
          onAddAnnotation={actions.document.onAddAnnotation}
          onRemoveAnnotation={actions.document.onRemoveAnnotation}
          onSelectAnnotation={actions.document.onSelectAnnotation}
          onAddGlobalAttachment={actions.document.onAddGlobalAttachment}
          onRemoveGlobalAttachment={actions.document.onRemoveGlobalAttachment}
          onEditorHandleReady={actions.document.onEditorHandleReady}
          onMarkdownChange={actions.document.onMarkdownChange}
          onOpenLinkedDocument={actions.document.onOpenLinkedDocument}
          onOpenCodeFile={actions.document.onOpenCodeFile}
          onOpenMessagePicker={actions.document.onOpenMessagePicker}
          onToggleCheckbox={actions.document.onToggleCheckbox}
          onAskAI={actions.document.onAskAI}
        />
        <EditorRightSidebarPane model={model.rightSidebar} actions={actions.rightSidebar} />
      </div>
    </ScrollViewportContext.Provider>
  );
}

function EditorAgentTerminal({
  model,
  actions,
}: {
  readonly model: EditorWorkspaceTerminalModel;
  readonly actions: EditorWorkspaceTerminalActions;
}) {
  if (!model.shouldRender || model.capability === null) return null;

  return (
    <div
      className={
        model.isOpen
          ? "contents group/agent-terminal"
          : "absolute left-0 top-0 h-full w-0 overflow-hidden pointer-events-none group/agent-terminal"
      }
      aria-hidden={!model.isOpen}
      inert={!model.isOpen ? true : undefined}
    >
      <AnnotateAgentTerminalPanel
        ref={model.panelRef}
        capability={model.capability}
        width={`var(--agent-terminal-w, ${model.width}px)`}
        onSessionActiveChange={actions.onSessionActiveChange}
        onSessionReadyChange={actions.onSessionReadyChange}
        onClose={actions.onClose}
      />
      {model.isOpen && (
        <ResizeHandle
          isDragging={model.isResizeDragging}
          onPointerDown={actions.onResizePointerDown}
          onDoubleClick={actions.onResizeDoubleClick}
          style={model.resizeHandleStyle}
          className="hidden lg:block z-[55]"
          side="left"
          onCollapse={actions.onClose}
        />
      )}
    </div>
  );
}
