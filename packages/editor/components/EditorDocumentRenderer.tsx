import type { CSSProperties, RefObject } from "react";
import type { CommentAskAIHandler } from "@plannotator/ui/components/CommentPopover";
import { HtmlViewer } from "@plannotator/ui/components/html-viewer";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@plannotator/ui/components/MarkdownEditor";
import { Viewer, type ViewerHandle } from "@plannotator/ui/components/Viewer";
import type { LinkedDocBadgeInfo } from "@plannotator/ui/components/DocBadges";
import type { Frontmatter } from "@plannotator/ui/utils/parser";
import type {
  ActionsLabelMode,
  Annotation,
  Block,
  EditorMode,
  ImageAttachment,
  InputMethod,
} from "@plannotator/ui/types";

interface EditorDocumentRendererProps {
  readonly renderAs: "markdown" | "html";
  readonly rawHtml: string;
  readonly displayedMarkdown: string;
  readonly blocks: Block[];
  readonly frontmatter: Frontmatter | null;
  readonly annotations: Annotation[];
  readonly selectedAnnotationId: string | null;
  readonly editorMode: EditorMode;
  readonly inputMethod: InputMethod;
  readonly globalAttachments: ImageAttachment[];
  readonly isHtmlSurface: boolean;
  readonly htmlToolsHidden: boolean;
  readonly isEditingMarkdown: boolean;
  readonly activeSourceDocumentKey: string | null;
  readonly editGeneration: number;
  readonly viewerContentKey: string;
  readonly viewerRef: RefObject<ViewerHandle | null>;
  readonly readerMaxWidth: number | null;
  readonly gridEnabled: boolean;
  readonly repoInfo: { display: string; branch?: string; host?: string } | null;
  readonly stickyActionsEnabled: boolean;
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

interface HtmlDocumentViewerProps {
  readonly rawHtml: string;
  readonly annotations: Annotation[];
  readonly selectedAnnotationId: string | null;
  readonly editorMode: EditorMode;
  readonly inputMethod: InputMethod;
  readonly globalAttachments: ImageAttachment[];
  readonly linkedDocument: LinkedDocBadgeInfo | null;
  readonly viewerRef: RefObject<ViewerHandle | null>;
  readonly isHtmlSurface: boolean;
  readonly htmlToolsHidden: boolean;
  readonly readerMaxWidth: number | null;
  readonly typographyStyle: CSSProperties;
  readonly onAddAnnotation: (annotation: Annotation) => void;
  readonly onSelectAnnotation: (annotationId: string | null) => void;
  readonly onAddGlobalAttachment: (image: ImageAttachment) => void;
  readonly onRemoveGlobalAttachment: (path: string) => void;
  readonly onAskAI: CommentAskAIHandler | undefined;
}

function HtmlDocumentViewer({
  rawHtml,
  annotations,
  selectedAnnotationId,
  editorMode,
  inputMethod,
  globalAttachments,
  linkedDocument,
  viewerRef,
  isHtmlSurface,
  htmlToolsHidden,
  readerMaxWidth,
  typographyStyle,
  onAddAnnotation,
  onSelectAnnotation,
  onAddGlobalAttachment,
  onRemoveGlobalAttachment,
  onAskAI,
}: HtmlDocumentViewerProps) {
  return (
    <HtmlViewer
      key={linkedDocument ? `doc:${linkedDocument.filepath}` : "plan"}
      ref={viewerRef}
      rawHtml={rawHtml}
      annotations={annotations}
      onAddAnnotation={onAddAnnotation}
      onSelectAnnotation={onSelectAnnotation}
      selectedAnnotationId={selectedAnnotationId}
      mode={editorMode}
      inputMethod={inputMethod}
      globalAttachments={globalAttachments}
      onAddGlobalAttachment={onAddGlobalAttachment}
      onRemoveGlobalAttachment={onRemoveGlobalAttachment}
      maxWidth={isHtmlSurface ? null : readerMaxWidth}
      fullViewport={isHtmlSurface}
      hideControls={htmlToolsHidden}
      typographyStyle={typographyStyle}
      onAskAI={onAskAI}
    />
  );
}

interface MarkdownDocumentEditorProps {
  readonly markdown: string;
  readonly activeSourceDocumentKey: string | null;
  readonly editGeneration: number;
  readonly readerMaxWidth: number | null;
  readonly gridEnabled: boolean;
  readonly onEditorHandleReady: (handle: MarkdownEditorHandle | null) => void;
  readonly onMarkdownChange: (markdown: string) => void;
}

function MarkdownDocumentEditor({
  markdown,
  activeSourceDocumentKey,
  editGeneration,
  readerMaxWidth,
  gridEnabled,
  onEditorHandleReady,
  onMarkdownChange,
}: MarkdownDocumentEditorProps) {
  return (
    <MarkdownEditor
      markdown={markdown}
      documentId={`edit:${activeSourceDocumentKey ?? "root"}:${editGeneration}`}
      onEditorHandleReady={onEditorHandleReady}
      onMarkdownChange={onMarkdownChange}
      maxWidth={readerMaxWidth}
      gridEnabled={gridEnabled}
    />
  );
}

interface MarkdownDocumentViewerProps {
  readonly viewerContentKey: string;
  readonly viewerRef: RefObject<ViewerHandle | null>;
  readonly blocks: Block[];
  readonly markdown: string;
  readonly frontmatter: Frontmatter | null;
  readonly annotations: Annotation[];
  readonly selectedAnnotationId: string | null;
  readonly editorMode: EditorMode;
  readonly inputMethod: InputMethod;
  readonly gridEnabled: boolean;
  readonly globalAttachments: ImageAttachment[];
  readonly repoInfo: { display: string; branch?: string; host?: string } | null;
  readonly stickyActionsEnabled: boolean;
  readonly showDemoBadge: boolean;
  readonly readerMaxWidth: number | null;
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
  readonly onOpenLinkedDocument: (path: string) => void;
  readonly onOpenCodeFile: (path: string) => void;
  readonly onOpenMessagePicker: () => void;
  readonly onToggleCheckbox: (blockId: string, checked: boolean) => void;
  readonly onAskAI: CommentAskAIHandler | undefined;
}

function MarkdownDocumentViewer({
  viewerContentKey,
  viewerRef,
  blocks,
  markdown,
  frontmatter,
  annotations,
  selectedAnnotationId,
  editorMode,
  inputMethod,
  gridEnabled,
  globalAttachments,
  repoInfo,
  stickyActionsEnabled,
  showDemoBadge,
  readerMaxWidth,
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
  onOpenLinkedDocument,
  onOpenCodeFile,
  onOpenMessagePicker,
  onToggleCheckbox,
  onAskAI,
}: MarkdownDocumentViewerProps) {
  return (
    <Viewer
      key={viewerContentKey}
      ref={viewerRef}
      blocks={blocks}
      markdown={markdown}
      frontmatter={frontmatter}
      annotations={annotations}
      onAddAnnotation={onAddAnnotation}
      onRemoveAnnotation={onRemoveAnnotation}
      onSelectAnnotation={onSelectAnnotation}
      selectedAnnotationId={selectedAnnotationId}
      mode={editorMode}
      inputMethod={inputMethod}
      gridEnabled={gridEnabled}
      globalAttachments={globalAttachments}
      onAddGlobalAttachment={onAddGlobalAttachment}
      onRemoveGlobalAttachment={onRemoveGlobalAttachment}
      repoInfo={repoInfo}
      stickyActions={stickyActionsEnabled}
      showDemoBadge={showDemoBadge}
      maxWidth={readerMaxWidth}
      onOpenLinkedDoc={onOpenLinkedDocument}
      onOpenCodeFile={onOpenCodeFile}
      linkedDocInfo={linkedDocument}
      imageBaseDir={imageBaseDir}
      codePathBaseDir={codePathBaseDir}
      copyLabel={copyLabel}
      sourceInfo={sourceInfo}
      openInAppPath={openInAppPath}
      messagePickerInfo={
        messagePickerInfo ? { ...messagePickerInfo, onOpen: onOpenMessagePicker } : undefined
      }
      onToggleCheckbox={onToggleCheckbox}
      checkboxOverrides={checkboxOverrides}
      actionsLabelMode={actionsLabelMode}
      typographyStyle={typographyStyle}
      onAskAI={onAskAI}
    />
  );
}

/** Renders the active HTML, editable markdown, or annotated markdown document surface. */
export function EditorDocumentRenderer({
  renderAs,
  rawHtml,
  displayedMarkdown,
  blocks,
  frontmatter,
  annotations,
  selectedAnnotationId,
  editorMode,
  inputMethod,
  globalAttachments,
  isHtmlSurface,
  htmlToolsHidden,
  isEditingMarkdown,
  activeSourceDocumentKey,
  editGeneration,
  viewerContentKey,
  viewerRef,
  readerMaxWidth,
  gridEnabled,
  repoInfo,
  stickyActionsEnabled,
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
}: EditorDocumentRendererProps) {
  if (renderAs === "html") {
    return (
      <HtmlDocumentViewer
        rawHtml={rawHtml}
        annotations={annotations}
        selectedAnnotationId={selectedAnnotationId}
        editorMode={editorMode}
        inputMethod={inputMethod}
        globalAttachments={globalAttachments}
        linkedDocument={linkedDocument}
        viewerRef={viewerRef}
        isHtmlSurface={isHtmlSurface}
        htmlToolsHidden={htmlToolsHidden}
        readerMaxWidth={readerMaxWidth}
        typographyStyle={typographyStyle}
        onAddAnnotation={onAddAnnotation}
        onSelectAnnotation={onSelectAnnotation}
        onAddGlobalAttachment={onAddGlobalAttachment}
        onRemoveGlobalAttachment={onRemoveGlobalAttachment}
        onAskAI={onAskAI}
      />
    );
  }

  if (isEditingMarkdown) {
    return (
      <MarkdownDocumentEditor
        markdown={displayedMarkdown}
        activeSourceDocumentKey={activeSourceDocumentKey}
        editGeneration={editGeneration}
        readerMaxWidth={readerMaxWidth}
        gridEnabled={gridEnabled}
        onEditorHandleReady={onEditorHandleReady}
        onMarkdownChange={onMarkdownChange}
      />
    );
  }

  return (
    <MarkdownDocumentViewer
      viewerContentKey={viewerContentKey}
      viewerRef={viewerRef}
      blocks={blocks}
      markdown={displayedMarkdown}
      frontmatter={frontmatter}
      annotations={annotations}
      selectedAnnotationId={selectedAnnotationId}
      editorMode={editorMode}
      inputMethod={inputMethod}
      gridEnabled={gridEnabled}
      globalAttachments={globalAttachments}
      repoInfo={repoInfo}
      stickyActionsEnabled={stickyActionsEnabled}
      showDemoBadge={showDemoBadge}
      readerMaxWidth={readerMaxWidth}
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
      onOpenLinkedDocument={onOpenLinkedDocument}
      onOpenCodeFile={onOpenCodeFile}
      onOpenMessagePicker={onOpenMessagePicker}
      onToggleCheckbox={onToggleCheckbox}
      onAskAI={onAskAI}
    />
  );
}
