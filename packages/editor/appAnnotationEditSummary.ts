import {
  buildPlanEditPanelItem,
  buildSavedFileChangePanelItems,
  type DirectEditPanelItem,
} from "./directEdits";
import { buildFeedbackLossDescription, type AnnotateSource } from "./appPresentation";

/** Immutable saved-file edit context needed to build the annotation sidebar summary. */
export interface SavedFileChangeSummaryInput {
  readonly key: string;
  readonly path: string;
  readonly basename: string;
  readonly beforeText: string;
  readonly afterText: string;
}

/** Immutable App state required to derive annotation and direct-edit feedback summary. */
export interface BuildAppAnnotationEditSummaryInput {
  readonly annotateSource: AnnotateSource;
  readonly recentMessageCount: number;
  readonly messageFeedbackAnnotationCount: number;
  readonly annotationCount: number;
  readonly codeAnnotationCount: number;
  readonly editorAnnotationCount: number;
  readonly linkedDocumentAnnotationCount: number;
  readonly globalAttachmentCount: number;
  readonly sharingEnabled: boolean;
  readonly activeSourceSaveEnabled: boolean;
  readonly unsavedSourceFileBufferCount: number;
  readonly isEditingMarkdown: boolean;
  readonly editorDiffersFromBaseline: boolean;
  readonly hasCommittedPlanEdit: boolean;
  readonly savedFileChanges: readonly SavedFileChangeSummaryInput[];
  readonly hasEditStats: boolean;
  readonly originalMarkdown: string | null;
  readonly editedMarkdown: string | null;
}

/** Read-only feedback counts, availability, and direct-edit panel data derived from App state. */
export interface AppAnnotationEditSummary {
  readonly messageMultiSelectMode: boolean;
  readonly hasAnyAnnotations: boolean;
  readonly feedbackAnnotationCount: number;
  readonly canShareCurrentSession: boolean;
  readonly hasUnsavedSourceFileBuffers: boolean;
  readonly hasDirectEdits: boolean;
  readonly hasSavedFileChanges: boolean;
  readonly hasFeedbackContent: boolean;
  readonly feedbackLoss: string;
  readonly hasUnsentFeedback: boolean;
  readonly directEditsPanelInfo: readonly Readonly<DirectEditPanelItem>[] | null;
}

function buildDirectEditsPanelInfo(
  input: BuildAppAnnotationEditSummaryInput,
): readonly Readonly<DirectEditPanelItem>[] | null {
  if (input.savedFileChanges.length > 0) {
    return buildSavedFileChangePanelItems([...input.savedFileChanges]);
  }

  if (input.activeSourceSaveEnabled || !input.hasEditStats) return null;

  if (input.originalMarkdown === null || input.editedMarkdown === null) return null;

  return [buildPlanEditPanelItem(input.originalMarkdown, input.editedMarkdown)];
}

/** Copies immutable summary items for the legacy sidebar model's mutable array boundary. */
export function copyAnnotationEditSummaryPanelItemsForSidebar(
  panelItems: AppAnnotationEditSummary["directEditsPanelInfo"],
): DirectEditPanelItem[] | null {
  return panelItems === null ? null : [...panelItems];
}

/** Builds annotation counts and reviewable direct-edit state without reading or mutating App state. */
export function buildAppAnnotationEditSummary(
  input: BuildAppAnnotationEditSummaryInput,
): AppAnnotationEditSummary {
  const messageMultiSelectMode = input.annotateSource === "message" && input.recentMessageCount > 1;

  const documentAnnotationCount =
    input.annotationCount +
    input.codeAnnotationCount +
    input.editorAnnotationCount +
    input.linkedDocumentAnnotationCount +
    input.globalAttachmentCount;

  const feedbackAnnotationCount = messageMultiSelectMode
    ? input.messageFeedbackAnnotationCount + input.editorAnnotationCount
    : documentAnnotationCount;

  const hasAnyAnnotations = feedbackAnnotationCount > 0;
  const hasUnsavedSourceFileBuffers = input.unsavedSourceFileBufferCount > 0;

  const hasDirectEdits =
    !input.activeSourceSaveEnabled &&
    !hasUnsavedSourceFileBuffers &&
    (input.isEditingMarkdown ? input.editorDiffersFromBaseline : input.hasCommittedPlanEdit);

  const hasSavedFileChanges = input.savedFileChanges.length > 0;

  return {
    messageMultiSelectMode,
    hasAnyAnnotations,
    feedbackAnnotationCount,
    canShareCurrentSession: input.sharingEnabled && input.codeAnnotationCount === 0,
    hasUnsavedSourceFileBuffers,
    hasDirectEdits,
    hasSavedFileChanges,
    hasFeedbackContent: hasAnyAnnotations || hasDirectEdits || hasSavedFileChanges,
    feedbackLoss: buildFeedbackLossDescription(feedbackAnnotationCount, hasDirectEdits),
    hasUnsentFeedback: feedbackAnnotationCount > 0 || hasDirectEdits,
    directEditsPanelInfo: buildDirectEditsPanelInfo(input),
  };
}
