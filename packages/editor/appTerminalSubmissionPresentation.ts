import type { Annotation, CodeAnnotation } from "@plannotator/ui/types";
import {
  isMatchingAgentTerminalDelivery,
  type AgentTerminalDeliveryRecord,
} from "./agentTerminalIntegration";
import type { AnnotateSource, SubmissionStatus } from "./appPresentation";

/** Immutable delivery state needed to decide whether terminal feedback remains unsent. */
export interface BuildAppTerminalFeedbackPresentationInput {
  readonly annotateMode: boolean;
  readonly hasFeedbackContent: boolean;
  readonly deliveredTerminalFeedback: AgentTerminalDeliveryRecord | null;
  readonly currentTerminalFeedback: AgentTerminalDeliveryRecord | null;
}

/** Terminal feedback delivery facts displayed by the editor. */
export interface AppTerminalFeedbackPresentation {
  readonly isCurrentFeedbackDeliveredToAgent: boolean;
  readonly showAgentTerminalDeliveryStatus: boolean;
  readonly hasFeedbackToSend: boolean;
}

/** Builds terminal feedback delivery status without reading or mutating App state. */
export function buildAppTerminalFeedbackPresentation(
  input: BuildAppTerminalFeedbackPresentationInput,
): AppTerminalFeedbackPresentation {
  const isCurrentFeedbackDeliveredToAgent = isMatchingAgentTerminalDelivery(
    input.deliveredTerminalFeedback,
    input.currentTerminalFeedback,
  );

  return {
    isCurrentFeedbackDeliveredToAgent,
    showAgentTerminalDeliveryStatus:
      input.annotateMode &&
      input.deliveredTerminalFeedback !== null &&
      isCurrentFeedbackDeliveredToAgent,
    hasFeedbackToSend: input.hasFeedbackContent && !isCurrentFeedbackDeliveredToAgent,
  };
}

/** Immutable document state needed for terminal prompts and AI session context. */
export interface BuildAppTerminalDocumentPresentationInput {
  readonly linkedDocumentIsActive: boolean;
  readonly linkedDocumentPath: string | null;
  readonly linkedDocumentIsConverted: boolean;
  readonly sourceFilePath: string | undefined;
  readonly activeFilePath: string | null;
  readonly annotateMode: boolean;
  readonly annotateSource: AnnotateSource;
  readonly sourceInfo: string | undefined;
  readonly sourceConverted: boolean;
}

/** Terminal prompt path and AI document facts derived from the active editor document. */
export interface AppTerminalDocumentPresentation {
  readonly terminalAskReadableFilePath: string | null;
  readonly aiDocumentPath: string;
  readonly aiSourceInfo: string | undefined;
  readonly aiSourceConverted: boolean;
  readonly hasAIDocumentContext: boolean;
}

function getAIDocumentPath(input: BuildAppTerminalDocumentPresentationInput): string {
  if (input.linkedDocumentIsActive) return input.linkedDocumentPath ?? "linked document";

  if (input.sourceFilePath) return input.sourceFilePath;

  if (input.annotateSource === "message") return "agent message";

  if (input.annotateSource === "folder") return "folder document";

  return "document";
}

function getTerminalAskReadableFilePath(
  input: BuildAppTerminalDocumentPresentationInput,
): string | null {
  if (input.linkedDocumentIsActive && input.linkedDocumentPath) return input.linkedDocumentPath;

  return input.sourceFilePath ?? input.activeFilePath;
}

/** Builds terminal prompt and AI document context without reading or mutating App state. */
export function buildAppTerminalDocumentPresentation(
  input: BuildAppTerminalDocumentPresentationInput,
): AppTerminalDocumentPresentation {
  return {
    terminalAskReadableFilePath: getTerminalAskReadableFilePath(input),
    aiDocumentPath: getAIDocumentPath(input),
    aiSourceInfo: input.linkedDocumentIsActive
      ? (input.linkedDocumentPath ?? undefined)
      : input.sourceInfo,
    aiSourceConverted: input.linkedDocumentIsActive
      ? input.linkedDocumentIsConverted
      : input.sourceConverted,
    hasAIDocumentContext:
      input.annotateMode ||
      input.linkedDocumentIsActive ||
      Boolean(input.sourceFilePath) ||
      input.annotateSource === "message",
  };
}

/** Immutable feedback inputs needed to prepare the server feedback request body. */
export interface BuildEditorFeedbackRequestInput {
  readonly draftGeneration: number;
  readonly feedback: string;
  readonly annotations: readonly Annotation[];
  readonly codeAnnotations: readonly CodeAnnotation[];
  readonly messageMultiSelectMode: boolean;
  readonly annotatedMessageIds: readonly string[];
  readonly selectedMessageId: string | null;
}

/** Immutable request body sent when an editor annotation session submits feedback. */
export interface EditorFeedbackRequest {
  readonly draftGeneration: number;
  readonly feedback: string;
  readonly annotations: readonly Annotation[];
  readonly codeAnnotations: readonly CodeAnnotation[];
  readonly selectedMessageId?: string;
  readonly feedbackScope?: "messages";
}

/** Builds message-scoped feedback requests without mutating an object after construction. */
export function buildEditorFeedbackRequest(
  input: BuildEditorFeedbackRequestInput,
): EditorFeedbackRequest {
  const request = {
    draftGeneration: input.draftGeneration,
    feedback: input.feedback,
    annotations: input.annotations,
    codeAnnotations: input.codeAnnotations,
  };

  if (input.messageMultiSelectMode && input.annotatedMessageIds.length > 1) {
    return { ...request, feedbackScope: "messages" };
  }

  const selectedMessageId = input.messageMultiSelectMode
    ? input.annotatedMessageIds[0]
    : (input.selectedMessageId ?? undefined);

  return selectedMessageId ? { ...request, selectedMessageId } : request;
}

/** Immutable submission state needed to render header actions and completion feedback. */
export interface BuildAppSubmissionCompletionPresentationInput {
  readonly submitted: SubmissionStatus;
  readonly agentName: string;
  readonly annotateSource: AnnotateSource;
  readonly callbackConfigured: boolean;
  readonly shareUrl: string;
  readonly shortShareUrl: string | undefined;
  readonly renderAs: "markdown" | "html";
  readonly shareHtml: string;
  readonly rawHtml: string;
  readonly hasAnyAnnotations: boolean;
  readonly hasDirectEdits: boolean;
  readonly hasSavedFileChanges: boolean;
}

/** Completion overlay data passed through App to the unchanged overlay component. */
export interface EditorCompletionPresentation {
  readonly submitted: SubmissionStatus;
  readonly agentName: string;
  readonly annotateSource: AnnotateSource;
}

/** Submission and completion facts derived without reading or mutating App state. */
export interface AppSubmissionCompletionPresentation {
  readonly isSubmitted: boolean;
  readonly callbackShareUrlReady: boolean;
  readonly hasHeaderFeedback: boolean;
  readonly completion: EditorCompletionPresentation;
}

/** Builds callback readiness, header feedback visibility, and completion overlay data. */
export function buildAppSubmissionCompletionPresentation(
  input: BuildAppSubmissionCompletionPresentationInput,
): AppSubmissionCompletionPresentation {
  const hasShareUrl = Boolean(input.shareUrl || input.shortShareUrl);
  const hasShareableHtml = input.renderAs === "html" && Boolean(input.shareHtml || input.rawHtml);

  return {
    isSubmitted: input.submitted !== null,
    callbackShareUrlReady: !input.callbackConfigured || hasShareUrl || hasShareableHtml,
    hasHeaderFeedback: input.hasAnyAnnotations || input.hasDirectEdits || input.hasSavedFileChanges,
    completion: {
      submitted: input.submitted,
      agentName: input.agentName,
      annotateSource: input.annotateSource,
    },
  };
}
