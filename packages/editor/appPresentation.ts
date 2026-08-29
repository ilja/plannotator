import type { ActionsLabelMode } from "@plannotator/ui/types";
import type { PlanWidth } from "@plannotator/ui/utils/uiPreferences";

export type AnnotateSource = "file" | "message" | "folder" | null;
export type SubmissionStatus = "approved" | "denied" | "exited" | null;

/** Immutable App state required to derive the active document presentation. */
export interface BuildAppDocumentPresentationInput {
  readonly displayedMarkdown: string;
  readonly rootMarkdown: string;
  readonly renderAs: "markdown" | "html";
  readonly annotateSource: AnnotateSource;
  readonly selectedMessageId: string | null;
  readonly editGeneration: number;
  readonly activeSourceSaveEnabled: boolean;
  readonly hasEditStats: boolean;
  readonly linkedDocumentIsActive: boolean;
  readonly isSharedSession: boolean;
  readonly isSubmitted: boolean;
  readonly canUseWideMode: boolean;
  readonly wideModeType: "wide" | "focus" | null;
  readonly planWidth: PlanWidth;
  readonly annotateMode: boolean;
  readonly agentTerminalAvailable: boolean;
  readonly isAgentTerminalOpen: boolean;
  readonly isAgentTerminalRunning: boolean;
  readonly sourceFilePath: string | undefined;
  readonly linkedDocumentPath: string | null;
  readonly isActiveFileVault: boolean;
  readonly hasActiveFile: boolean;
}

/** Read-only document facts and visual state derived from App session values. */
export interface AppDocumentPresentation {
  readonly isHtmlSurface: boolean;
  readonly backLabel: string;
  readonly viewerContentKey: string;
  readonly annotateReaderMaxWidth: number | null;
  readonly canEditMarkdown: boolean;
  readonly showAgentTerminalControls: boolean;
  readonly shouldRenderAgentTerminal: boolean;
  readonly linkedDocumentLabel: string | undefined;
  readonly linkedDocumentVariant: "folder-file" | "breadcrumb";
  readonly viewerCopyLabel: string | undefined;
  readonly viewerOpenInAppPath: string | null;
  readonly showEmptyFolderPresentation: boolean;
}

function canEditActiveDocument(input: BuildAppDocumentPresentationInput): boolean {
  // The editor only opens on the main plan/file markdown, never on HTML surfaces,
  // linked-document references, messages, folder pickers, or shared sessions.
  return (
    input.renderAs !== "html" &&
    (input.activeSourceSaveEnabled || input.displayedMarkdown !== "" || input.hasEditStats) &&
    (!input.linkedDocumentIsActive ||
      (input.annotateSource === "folder" && input.activeSourceSaveEnabled)) &&
    !input.isSharedSession &&
    input.annotateSource !== "message" &&
    !input.isSubmitted
  );
}

function getLinkedDocumentLabel(input: BuildAppDocumentPresentationInput): string | undefined {
  if (input.annotateSource === "folder") return undefined;
  if (input.isActiveFileVault) return "Vault File";
  return input.hasActiveFile ? "File" : undefined;
}

function getViewerCopyLabel(source: AnnotateSource): string | undefined {
  if (source === "message") return "Copy message";
  if (source === "file" || source === "folder") return "Copy file";
  return undefined;
}

function getViewerOpenInAppPath(input: BuildAppDocumentPresentationInput): string | null {
  if (!input.annotateMode) return null;
  return input.linkedDocumentIsActive ? input.linkedDocumentPath : (input.sourceFilePath ?? null);
}

/** Builds document data and presentation decisions without reading or mutating App state. */
export function buildAppDocumentPresentation(
  input: BuildAppDocumentPresentationInput,
): AppDocumentPresentation {
  const planMaxWidth = getPlanMaxWidth(input.planWidth);
  // HTML plans render edge-to-edge instead of in the centered markdown column.
  const isHtmlSurface = input.renderAs === "html";
  const showAgentTerminalControls =
    input.annotateMode && input.annotateSource !== "message" && input.agentTerminalAvailable;

  return {
    isHtmlSurface,
    backLabel: getBackLabel(input.annotateSource),
    viewerContentKey: getViewerContentKey(
      input.linkedDocumentIsActive,
      input.linkedDocumentPath,
      input.annotateSource,
      input.selectedMessageId,
      input.editGeneration,
    ),
    annotateReaderMaxWidth:
      input.canUseWideMode && input.wideModeType === "wide" ? null : planMaxWidth,
    canEditMarkdown: canEditActiveDocument(input),
    showAgentTerminalControls,
    shouldRenderAgentTerminal:
      showAgentTerminalControls &&
      input.wideModeType === null &&
      (input.isAgentTerminalOpen || input.isAgentTerminalRunning),
    linkedDocumentLabel: getLinkedDocumentLabel(input),
    linkedDocumentVariant: input.annotateSource === "folder" ? "folder-file" : "breadcrumb",
    viewerCopyLabel: getViewerCopyLabel(input.annotateSource),
    viewerOpenInAppPath: getViewerOpenInAppPath(input),
    showEmptyFolderPresentation:
      input.annotateSource === "folder" && !input.rootMarkdown && !input.linkedDocumentIsActive,
  };
}

export function buildDraftBannerMessage(count: number, timeAgo: string, hasEdits: boolean): string {
  const parts = [
    count > 0 ? `${count} annotation${count !== 1 ? "s" : ""}` : "",
    hasEdits ? "unsent direct edits" : "",
  ].filter(Boolean);
  return `Found ${parts.join(" and ")} from ${timeAgo}. Would you like to restore them?`;
}

export function buildFeedbackLossDescription(
  annotationCount: number,
  hasDirectEdits: boolean,
): string {
  const parts = [
    annotationCount > 0
      ? `${annotationCount} annotation${annotationCount !== 1 ? "s" : ""}`
      : "",
    hasDirectEdits ? "direct edits" : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" and ") : "feedback";
}

export function getBackLabel(source: AnnotateSource): string {
  if (source === "folder") return "file list";
  if (source === "file") return "file";
  if (source === "message") return "message";
  return "document";
}

// Viewer identity changes with rendered content because web-highlighter mutates the
// Viewer DOM; a changed key remounts it before React reconciles a new document.
export function getViewerContentKey(
  isLinkedDocumentActive: boolean,
  linkedDocumentPath: string | null,
  source: AnnotateSource,
  selectedMessageId: string | null,
  editGeneration: number,
): string {
  if (isLinkedDocumentActive) return `doc:${linkedDocumentPath}`;
  if (source === "message" && selectedMessageId) return `msg:${selectedMessageId}`;
  return `plan:${editGeneration}`;
}

export function getActionsLabelMode(width: number): ActionsLabelMode {
  if (width >= 800) return "full";
  if (width >= 680) return "short";
  return "icon";
}

export function getPlanMaxWidth(width: PlanWidth): number {
  const widths = { compact: 832, default: 1040, wide: 1280 } as const satisfies Record<
    PlanWidth,
    number
  >;
  return widths[width];
}

export function buildAnnotationFeedbackHeading(source: AnnotateSource): string {
  if (source === "message") return "Message Feedback";
  if (source === "folder") return "Folder Feedback";
  if (source === "file") return "File Feedback";
  return "Document Feedback";
}

export function buildCompletionTitle(submitted: SubmissionStatus): string {
  if (submitted === "exited") return "Session Closed";
  if (submitted === "approved") return "Approved";
  return "Feedback Sent";
}

export function buildCompletionSubtitle(
  submitted: SubmissionStatus,
  agentName: string,
  source: AnnotateSource,
): string {
  if (submitted === "exited") return "Annotation session closed without feedback.";
  if (submitted === "approved") return `${agentName} will proceed.`;
  const target = source === "message" ? "message" : source === "folder" ? "files" : "file";
  return `${agentName} will address your feedback on the ${target}.`;
}
