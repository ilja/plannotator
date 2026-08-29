import React, { type CSSProperties, type RefObject } from "react";
import type { CommentAskAIHandler } from "@plannotator/ui/components/CommentPopover";
import { AnnotationToolstrip } from "@plannotator/ui/components/AnnotationToolstrip";
import { OverlayScrollArea } from "@plannotator/ui/components/OverlayScrollArea";
import { StickyHeaderLane } from "@plannotator/ui/components/StickyHeaderLane";
import { Tooltip } from "@plannotator/ui/components/Tooltip";
import type { LinkedDocBadgeInfo } from "@plannotator/ui/components/DocBadges";
import type { MarkdownEditorHandle } from "@plannotator/ui/components/MarkdownEditor";
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
import { EditorDocumentRenderer } from "./EditorDocumentRenderer";

interface EditorDocumentSurfaceProps {
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
  readonly onViewportReady: (viewport: HTMLElement | null) => void;
  readonly onInputMethodChange: (method: InputMethod) => void;
  readonly onEditorModeChange: (mode: EditorMode) => void;
  readonly onToggleViewMode: (type: "wide" | "focus") => void;
  readonly onSaveSourceFile: () => void;
  readonly onEditExit: () => void;
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

interface StickyDocumentHeaderProps {
  readonly isHtmlSurface: boolean;
  readonly isEditingMarkdown: boolean;
  readonly stickyActionsEnabled: boolean;
  readonly inputMethod: InputMethod;
  readonly editorMode: EditorMode;
  readonly repoInfo: { display: string; branch?: string; host?: string } | null;
  readonly readerMaxWidth: number | null;
  readonly viewerContentKey: string;
  readonly onInputMethodChange: (method: InputMethod) => void;
  readonly onEditorModeChange: (mode: EditorMode) => void;
}

function StickyDocumentHeader({
  isHtmlSurface,
  isEditingMarkdown,
  stickyActionsEnabled,
  inputMethod,
  editorMode,
  repoInfo,
  readerMaxWidth,
  viewerContentKey,
  onInputMethodChange,
  onEditorModeChange,
}: StickyDocumentHeaderProps) {
  if (isHtmlSurface || isEditingMarkdown || !stickyActionsEnabled) return null;

  return (
    <StickyHeaderLane
      inputMethod={inputMethod}
      onInputMethodChange={onInputMethodChange}
      mode={editorMode}
      onModeChange={onEditorModeChange}
      repoInfo={repoInfo}
      maxWidth={readerMaxWidth}
      remountToken={viewerContentKey}
    />
  );
}

interface DocumentToolstripProps {
  readonly isHtmlSurface: boolean;
  readonly isEditingMarkdown: boolean;
  readonly htmlToolsHidden: boolean;
  readonly sidebarIsOpen: boolean;
  readonly readerMaxWidth: number | null;
  readonly inputMethod: InputMethod;
  readonly editorMode: EditorMode;
  readonly onInputMethodChange: (method: InputMethod) => void;
  readonly onEditorModeChange: (mode: EditorMode) => void;
}

function DocumentToolstrip({
  isHtmlSurface,
  isEditingMarkdown,
  htmlToolsHidden,
  sidebarIsOpen,
  readerMaxWidth,
  inputMethod,
  editorMode,
  onInputMethodChange,
  onEditorModeChange,
}: DocumentToolstripProps) {
  if (isEditingMarkdown || (isHtmlSurface && htmlToolsHidden)) return null;

  return (
    <div
      data-print-hide
      className={
        isHtmlSurface
          ? `absolute top-3 ${sidebarIsOpen ? "left-3" : "left-10"} z-20 flex items-center rounded-lg border border-border/50 bg-background/85 px-1.5 py-1 shadow-md backdrop-blur-sm`
          : "w-full mb-3 md:mb-4 flex items-center justify-start"
      }
      style={isHtmlSurface || readerMaxWidth == null ? undefined : { maxWidth: readerMaxWidth }}
    >
      <AnnotationToolstrip
        inputMethod={inputMethod}
        onInputMethodChange={onInputMethodChange}
        mode={editorMode}
        onModeChange={onEditorModeChange}
        showHelpLink={!isHtmlSurface}
      />
    </div>
  );
}

function EmptyFolderPresentation() {
  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-3xl p-12 text-center text-muted-foreground">
        <p className="text-lg font-medium mb-2">Select a file to annotate</p>
        <p className="text-sm">Pick a markdown or HTML file from the sidebar to begin.</p>
      </div>
    </div>
  );
}

interface WideModeButtonProps {
  readonly type: "wide" | "focus";
  readonly isActive: boolean;
  readonly showSeparator: boolean;
  readonly onToggle: (type: "wide" | "focus") => void;
}

function WideModeButton({ type, isActive, showSeparator, onToggle }: WideModeButtonProps) {
  return (
    <>
      {showSeparator && (
        <span aria-hidden className="text-muted-foreground/30 select-none">
          |
        </span>
      )}
      <Tooltip
        side="top"
        align="end"
        content={
          type === "wide"
            ? "Hide panels and expand document width"
            : "Hide panels, keep document width"
        }
      >
        <button
          type="button"
          onClick={() => onToggle(type)}
          aria-pressed={isActive}
          className={`cursor-pointer rounded-sm transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:opacity-80 ${
            isActive ? "text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"
          }`}
        >
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </button>
      </Tooltip>
    </>
  );
}

interface WideModeControlsProps {
  readonly wideModeType: "wide" | "focus" | null;
  readonly onToggle: (type: "wide" | "focus") => void;
}

function WideModeControls({ wideModeType, onToggle }: WideModeControlsProps) {
  return (
    <>
      <WideModeButton
        type="wide"
        isActive={wideModeType === "wide"}
        showSeparator={false}
        onToggle={onToggle}
      />
      <WideModeButton
        type="focus"
        isActive={wideModeType === "focus"}
        showSeparator
        onToggle={onToggle}
      />
    </>
  );
}

interface SourceSaveControlProps {
  readonly fileName: string;
  readonly status: SourceBackedDocumentSaveStatus | undefined;
  readonly saveFailed: boolean;
  readonly emphasizeSave: boolean;
  readonly hasUnsavedDiskChanges: boolean;
  readonly onSave: () => void;
}

function SourceSaveControl({
  fileName,
  status,
  saveFailed,
  emphasizeSave,
  hasUnsavedDiskChanges,
  onSave,
}: SourceSaveControlProps) {
  const label = status === "saving" ? "Saving" : hasUnsavedDiskChanges ? "Save" : "Saved";
  const textClassName = saveFailed
    ? "text-destructive"
    : emphasizeSave
      ? "text-primary"
      : "text-muted-foreground/50 hover:text-muted-foreground";
  const dotClassName = saveFailed
    ? "bg-destructive"
    : emphasizeSave
      ? "bg-primary"
      : "bg-transparent";

  return (
    <>
      <Tooltip side="top" align="end" content={`Save changes to ${fileName}`}>
        <button
          type="button"
          onClick={onSave}
          disabled={status === "saving"}
          className={`flex items-center gap-1 cursor-pointer rounded-sm transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${textClassName}`}
        >
          <span className="grid justify-items-start">
            <span aria-hidden className="invisible col-start-1 row-start-1">
              Saving
            </span>
            <span className="col-start-1 row-start-1">{label}</span>
          </span>
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-150 ${dotClassName}`}
          />
        </button>
      </Tooltip>
      <span aria-hidden className="text-muted-foreground/30 select-none">
        |
      </span>
    </>
  );
}

interface EditModeControlProps {
  readonly isEditingMarkdown: boolean;
  readonly cancelMode: boolean;
  readonly confirmCancelEdits: boolean;
  readonly onEditExit: () => void;
}

function EditModeControl({
  isEditingMarkdown,
  cancelMode,
  confirmCancelEdits,
  onEditExit,
}: EditModeControlProps) {
  const tooltip = !isEditingMarkdown
    ? "Edit the document text directly"
    : cancelMode
      ? "Discard your edits and stop editing"
      : "Commit your edits and return to annotating";
  const label = !isEditingMarkdown
    ? "Edit"
    : cancelMode
      ? confirmCancelEdits
        ? "Discard?"
        : "Cancel"
      : "Done";
  const className = cancelMode
    ? confirmCancelEdits
      ? "text-destructive"
      : "text-muted-foreground/70 hover:text-foreground"
    : isEditingMarkdown
      ? "text-primary"
      : "text-muted-foreground/50 hover:text-muted-foreground";

  return (
    <Tooltip side="top" align="end" content={tooltip}>
      <button
        type="button"
        onClick={onEditExit}
        aria-pressed={isEditingMarkdown}
        className={`cursor-pointer rounded-sm transition-colors duration-150 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:opacity-80 ${className}`}
      >
        {label}
      </button>
    </Tooltip>
  );
}

interface DocumentModeControlsProps {
  readonly isHtmlSurface: boolean;
  readonly canUseWideMode: boolean;
  readonly canEditMarkdown: boolean;
  readonly wideModeType: "wide" | "focus" | null;
  readonly isEditingMarkdown: boolean;
  readonly sourceSaveFileName: string | null;
  readonly activeSaveStatus: SourceBackedDocumentSaveStatus | undefined;
  readonly saveFailed: boolean;
  readonly emphasizeSave: boolean;
  readonly hasUnsavedDiskChanges: boolean;
  readonly cancelMode: boolean;
  readonly confirmCancelEdits: boolean;
  readonly readerMaxWidth: number | null;
  readonly onToggleViewMode: (type: "wide" | "focus") => void;
  readonly onSaveSourceFile: () => void;
  readonly onEditExit: () => void;
}

function DocumentModeControls({
  isHtmlSurface,
  canUseWideMode,
  canEditMarkdown,
  wideModeType,
  isEditingMarkdown,
  sourceSaveFileName,
  activeSaveStatus,
  saveFailed,
  emphasizeSave,
  hasUnsavedDiskChanges,
  cancelMode,
  confirmCancelEdits,
  readerMaxWidth,
  onToggleViewMode,
  onSaveSourceFile,
  onEditExit,
}: DocumentModeControlsProps) {
  if (isHtmlSurface || (!canUseWideMode && !canEditMarkdown)) return null;

  return (
    <div
      data-print-hide
      className="absolute -top-5 left-0 right-0 mx-auto w-full flex justify-end pointer-events-none"
      style={readerMaxWidth === null ? undefined : { maxWidth: readerMaxWidth ?? 832 }}
    >
      <div className="pointer-events-auto flex items-center gap-1.5 text-[11px] tracking-wide mr-[4px]">
        {canUseWideMode && (
          <WideModeControls wideModeType={wideModeType} onToggle={onToggleViewMode} />
        )}
        {canEditMarkdown && (
          <>
            {canUseWideMode && (
              <span aria-hidden className="text-muted-foreground/30 select-none">
                |
              </span>
            )}
            {isEditingMarkdown && sourceSaveFileName !== null && (
              <SourceSaveControl
                fileName={sourceSaveFileName}
                status={activeSaveStatus}
                saveFailed={saveFailed}
                emphasizeSave={emphasizeSave}
                hasUnsavedDiskChanges={hasUnsavedDiskChanges}
                onSave={onSaveSourceFile}
              />
            )}
            <EditModeControl
              isEditingMarkdown={isEditingMarkdown}
              cancelMode={cancelMode}
              confirmCancelEdits={confirmCancelEdits}
              onEditExit={onEditExit}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Renders the scrollable document frame and its document-mode controls. */
export function EditorDocumentSurface({
  isHtmlSurface,
  gridEnabled,
  sidebarIsOpen,
  agentTerminalIsOpen,
  wideModeType,
  isEditingMarkdown,
  htmlToolsHidden,
  stickyActionsEnabled,
  inputMethod,
  editorMode,
  repoInfo,
  readerMaxWidth,
  viewerContentKey,
  showEmptyFolderPresentation,
  canUseWideMode,
  canEditMarkdown,
  activeSourceSaveFileName,
  activeSaveStatus,
  saveFailed,
  emphasizeSave,
  hasUnsavedDiskChanges,
  cancelMode,
  confirmCancelEdits,
  planAreaRef,
  onViewportReady,
  onInputMethodChange,
  onEditorModeChange,
  onToggleViewMode,
  onSaveSourceFile,
  onEditExit,
  renderAs,
  rawHtml,
  displayedMarkdown,
  blocks,
  frontmatter,
  annotations,
  selectedAnnotationId,
  globalAttachments,
  activeSourceDocumentKey,
  editGeneration,
  viewerRef,
  showDemoBadge,
  linkedDocument,
  imageBaseDir,
  codePathBaseDir,
  copyLabel,
  sourceInfo,
  openInAppPath,
  messagePickerInfo,
  checkboxOverrides,
  actionsLabelMode,
  typographyStyle,
  onAddAnnotation,
  onRemoveAnnotation,
  onSelectAnnotation,
  onAddGlobalAttachment,
  onRemoveGlobalAttachment,
  onEditorHandleReady,
  onMarkdownChange,
  onOpenLinkedDocument,
  onOpenCodeFile,
  onOpenMessagePicker,
  onToggleCheckbox,
  onAskAI,
}: EditorDocumentSurfaceProps) {
  const documentClassName = isHtmlSurface
    ? "bg-background"
    : `${gridEnabled ? "bg-grid " : "bg-card "}${!sidebarIsOpen && !agentTerminalIsOpen && wideModeType === null ? "lg:pl-[30px]" : ""}`;
  const documentFrameClassName = isHtmlSurface
    ? "h-full flex flex-col"
    : "min-h-full flex flex-col items-center px-2 py-3 md:px-10 md:py-8 xl:px-16";
  const contentClassName = isHtmlSurface
    ? "flex-1 flex flex-col"
    : `flex justify-center${isEditingMarkdown ? " flex-1 min-h-0" : ""}`;

  return (
    <OverlayScrollArea
      element="main"
      className={`flex-1 min-w-0 ${documentClassName}`}
      data-print-region="document"
      onViewportReady={onViewportReady}
    >
      <div ref={planAreaRef} className={`${documentFrameClassName} relative z-10`}>
        <StickyDocumentHeader
          isHtmlSurface={isHtmlSurface}
          isEditingMarkdown={isEditingMarkdown}
          stickyActionsEnabled={stickyActionsEnabled}
          inputMethod={inputMethod}
          editorMode={editorMode}
          repoInfo={repoInfo}
          readerMaxWidth={readerMaxWidth}
          viewerContentKey={viewerContentKey}
          onInputMethodChange={onInputMethodChange}
          onEditorModeChange={onEditorModeChange}
        />
        <DocumentToolstrip
          isHtmlSurface={isHtmlSurface}
          isEditingMarkdown={isEditingMarkdown}
          htmlToolsHidden={htmlToolsHidden}
          sidebarIsOpen={sidebarIsOpen}
          readerMaxWidth={readerMaxWidth}
          inputMethod={inputMethod}
          editorMode={editorMode}
          onInputMethodChange={onInputMethodChange}
          onEditorModeChange={onEditorModeChange}
        />
        {showEmptyFolderPresentation && <EmptyFolderPresentation />}
        <div
          className={`w-full relative ${contentClassName}`}
          style={{ display: showEmptyFolderPresentation ? "none" : undefined }}
        >
          <DocumentModeControls
            isHtmlSurface={isHtmlSurface}
            canUseWideMode={canUseWideMode}
            canEditMarkdown={canEditMarkdown}
            wideModeType={wideModeType}
            isEditingMarkdown={isEditingMarkdown}
            sourceSaveFileName={activeSourceSaveFileName}
            activeSaveStatus={activeSaveStatus}
            saveFailed={saveFailed}
            emphasizeSave={emphasizeSave}
            hasUnsavedDiskChanges={hasUnsavedDiskChanges}
            cancelMode={cancelMode}
            confirmCancelEdits={confirmCancelEdits}
            readerMaxWidth={readerMaxWidth}
            onToggleViewMode={onToggleViewMode}
            onSaveSourceFile={onSaveSourceFile}
            onEditExit={onEditExit}
          />
          <EditorDocumentRenderer
            renderAs={renderAs}
            rawHtml={rawHtml}
            displayedMarkdown={displayedMarkdown}
            blocks={blocks}
            frontmatter={frontmatter}
            annotations={annotations}
            selectedAnnotationId={selectedAnnotationId}
            editorMode={editorMode}
            inputMethod={inputMethod}
            globalAttachments={globalAttachments}
            isHtmlSurface={isHtmlSurface}
            htmlToolsHidden={htmlToolsHidden}
            isEditingMarkdown={isEditingMarkdown}
            activeSourceDocumentKey={activeSourceDocumentKey}
            editGeneration={editGeneration}
            viewerContentKey={viewerContentKey}
            viewerRef={viewerRef}
            readerMaxWidth={readerMaxWidth}
            gridEnabled={gridEnabled}
            repoInfo={repoInfo}
            stickyActionsEnabled={stickyActionsEnabled}
            showDemoBadge={showDemoBadge}
            linkedDocument={linkedDocument}
            imageBaseDir={imageBaseDir}
            codePathBaseDir={codePathBaseDir}
            copyLabel={copyLabel}
            sourceInfo={sourceInfo}
            openInAppPath={openInAppPath}
            messagePickerInfo={messagePickerInfo}
            checkboxOverrides={checkboxOverrides}
            actionsLabelMode={actionsLabelMode}
            typographyStyle={typographyStyle}
            onAddAnnotation={onAddAnnotation}
            onRemoveAnnotation={onRemoveAnnotation}
            onSelectAnnotation={onSelectAnnotation}
            onAddGlobalAttachment={onAddGlobalAttachment}
            onRemoveGlobalAttachment={onRemoveGlobalAttachment}
            onEditorHandleReady={onEditorHandleReady}
            onMarkdownChange={onMarkdownChange}
            onOpenLinkedDocument={onOpenLinkedDocument}
            onOpenCodeFile={onOpenCodeFile}
            onOpenMessagePicker={onOpenMessagePicker}
            onToggleCheckbox={onToggleCheckbox}
            onAskAI={onAskAI}
          />
        </div>
      </div>
    </OverlayScrollArea>
  );
}
