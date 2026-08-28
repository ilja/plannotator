import type { ActionsLabelMode } from "@plannotator/ui/types";
import type { PlanWidth } from "@plannotator/ui/utils/uiPreferences";

export type AnnotateSource = "file" | "message" | "folder" | null;
export type SubmissionStatus = "approved" | "denied" | "exited" | null;

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
