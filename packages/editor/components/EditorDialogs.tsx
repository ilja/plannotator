import { ConfirmDialog } from "@plannotator/ui/components/ConfirmDialog";
import { ExportModal } from "@plannotator/ui/components/ExportModal";
import { ImportModal } from "@plannotator/ui/components/ImportModal";
import type { ImportResult } from "@plannotator/ui/hooks/useSharing";
import { buildDraftBannerMessage } from "../appPresentation";

/** The action selected when warning about unsaved source-file edits. */
export type SourceFileEditWarningAction = "send-feedback" | "approve" | "close";

/** The initially selected tab when the export dialog opens. */
export type EditorExportTab = "share" | "annotations" | "notes";

/** Read-only display data for the editor's dialogs. */
export interface EditorDialogsModel {
  readonly draftBanner: {
    readonly count: number;
    readonly timeAgo: string;
    readonly hasEdits: boolean;
  } | null;
  readonly showExport: boolean;
  readonly shareUrl: string;
  readonly shareUrlSize: string;
  readonly shortShareUrl: string | undefined;
  readonly isGeneratingShortUrl: boolean;
  readonly shortUrlError: string | undefined;
  readonly annotationsOutput: string;
  readonly annotationCount: number;
  readonly sharingEnabled: boolean;
  readonly markdown: string;
  readonly isApiMode: boolean;
  readonly initialExportTab: EditorExportTab | undefined;
  readonly showImport: boolean;
  readonly shareBaseUrl: string | undefined;
  readonly showFeedbackPrompt: boolean;
  readonly canEditMarkdown: boolean;
  readonly agentName: string;
  readonly showSourceFileEditWarning: boolean;
  readonly sourceFileEditWarningAction: SourceFileEditWarningAction;
  readonly showExitWarning: boolean;
  readonly exitWarningAction: "close" | "approve";
  readonly feedbackLoss: string;
  readonly hasSavedFileChanges: boolean;
  readonly hasUnsentFeedback: boolean;
  readonly savedFileChangesCount: number;
  readonly shareLoadError: string | null;
}

/** Dialog actions retained by App, which remains the owner of all state transitions. */
export interface EditorDialogsActions {
  readonly onDismissDraft: () => void;
  readonly onRestoreDraft: () => void;
  readonly onCloseExport: () => void;
  readonly onGenerateShortUrl: () => void | Promise<void>;
  readonly onCloseImport: () => void;
  readonly onImport: (url: string) => Promise<ImportResult>;
  readonly onCloseFeedbackPrompt: () => void;
  readonly onCloseSourceFileEditWarning: () => void;
  readonly onConfirmSourceFileEditWarning: () => void;
  readonly onCloseExitWarning: () => void;
  readonly onConfirmExitWarning: () => void;
  readonly onClearShareLoadError: () => void;
}

/** Renders the editor's modal dialogs from read-only display data and App-owned actions. */
export function EditorDialogs({
  model,
  actions,
}: {
  readonly model: EditorDialogsModel;
  readonly actions: EditorDialogsActions;
}) {
  return (
    <>
      <DraftRecoveryDialog model={model} actions={actions} />
      <ExportDialog model={model} actions={actions} />
      <ImportDialog model={model} actions={actions} />
      <FeedbackPromptDialog model={model} actions={actions} />
      <SourceFileEditWarningDialog model={model} actions={actions} />
      <ExitWarningDialog model={model} actions={actions} />
      <SharedDocumentLoadErrorDialog model={model} actions={actions} />
    </>
  );
}

function DraftRecoveryDialog({
  model,
  actions,
}: {
  readonly model: EditorDialogsModel;
  readonly actions: EditorDialogsActions;
}) {
  return (
    <ConfirmDialog
      isOpen={model.draftBanner !== null}
      onClose={actions.onDismissDraft}
      onConfirm={actions.onRestoreDraft}
      title="Draft Recovered"
      message={
        model.draftBanner
          ? buildDraftBannerMessage(
              model.draftBanner.count,
              model.draftBanner.timeAgo,
              model.draftBanner.hasEdits,
            )
          : ""
      }
      confirmText="Restore"
      cancelText="Dismiss"
      showCancel
    />
  );
}

function ExportDialog({
  model,
  actions,
}: {
  readonly model: EditorDialogsModel;
  readonly actions: EditorDialogsActions;
}) {
  return (
    <ExportModal
      isOpen={model.showExport}
      onClose={actions.onCloseExport}
      shareUrl={model.shareUrl}
      shareUrlSize={model.shareUrlSize}
      shortShareUrl={model.shortShareUrl}
      isGeneratingShortUrl={model.isGeneratingShortUrl}
      shortUrlError={model.shortUrlError}
      onGenerateShortUrl={actions.onGenerateShortUrl}
      annotationsOutput={model.annotationsOutput}
      annotationCount={model.annotationCount}
      sharingEnabled={model.sharingEnabled}
      markdown={model.markdown}
      isApiMode={model.isApiMode}
      initialTab={model.initialExportTab}
    />
  );
}

function ImportDialog({
  model,
  actions,
}: {
  readonly model: EditorDialogsModel;
  readonly actions: EditorDialogsActions;
}) {
  return (
    <ImportModal
      isOpen={model.showImport}
      onClose={actions.onCloseImport}
      onImport={actions.onImport}
      shareBaseUrl={model.shareBaseUrl}
    />
  );
}

function FeedbackPromptDialog({
  model,
  actions,
}: {
  readonly model: EditorDialogsModel;
  readonly actions: EditorDialogsActions;
}) {
  const message = model.canEditMarkdown
    ? `To provide feedback, add annotations or direct edits. ${model.agentName} will use your feedback to revise the document.`
    : `To provide feedback, select text and add annotations. ${model.agentName} will use your annotations to revise the document.`;

  return (
    <ConfirmDialog
      isOpen={model.showFeedbackPrompt}
      onClose={actions.onCloseFeedbackPrompt}
      title="Add Feedback First"
      message={message}
      variant="info"
    />
  );
}

function SourceFileEditWarningDialog({
  model,
  actions,
}: {
  readonly model: EditorDialogsModel;
  readonly actions: EditorDialogsActions;
}) {
  const isClosing = model.sourceFileEditWarningAction === "close";
  const isApproving = model.sourceFileEditWarningAction === "approve";
  const title = isClosing ? "Unsaved File Edits" : "File Edits Won't Be Sent";
  const actionLabel = isApproving ? "approve" : "send feedback";
  const confirmText = isApproving ? "Approve Anyway" : isClosing ? "Close Anyway" : "Send Anyway";

  return (
    <ConfirmDialog
      isOpen={model.showSourceFileEditWarning}
      onClose={actions.onCloseSourceFileEditWarning}
      onConfirm={actions.onConfirmSourceFileEditWarning}
      title={title}
      message={
        isClosing ? (
          <>
            You have unsaved file edits. They are not saved to disk and will be lost if you close
            this session.
          </>
        ) : (
          <>
            You have unsaved file edits. They are not saved to disk, and {model.agentName} won't get
            them if you {actionLabel}.
          </>
        )
      }
      subMessage="Save or discard the file edits first if you want Plannotator to keep them."
      confirmText={confirmText}
      cancelText="Cancel"
      variant="warning"
      showCancel
    />
  );
}

function ExitWarningDialog({
  model,
  actions,
}: {
  readonly model: EditorDialogsModel;
  readonly actions: EditorDialogsActions;
}) {
  const isApproving = model.exitWarningAction === "approve";
  const actionLabel = isApproving ? "approve" : "close";
  const hasOnlySavedFileChanges = model.hasSavedFileChanges && !model.hasUnsentFeedback;

  const savedFileChangesLabel =
    model.savedFileChangesCount === 1 ? "saved file change" : "saved file changes";

  const savedFileChangesVerb = model.savedFileChangesCount === 1 ? "is" : "are";
  const savedFileChangesPronoun = model.savedFileChangesCount === 1 ? "it" : "them";

  return (
    <ConfirmDialog
      isOpen={model.showExitWarning}
      onClose={actions.onCloseExitWarning}
      onConfirm={actions.onConfirmExitWarning}
      title="Feedback Won't Be Sent"
      message={
        hasOnlySavedFileChanges ? (
          <>
            Your {savedFileChangesLabel} {savedFileChangesVerb} already on disk. The agent will not
            get that context if you {actionLabel}.
          </>
        ) : (
          <>
            You have {model.feedbackLoss} that will be lost if you {actionLabel}.
            {model.hasSavedFileChanges && (
              <>
                {" "}
                Your {savedFileChangesLabel} will stay on disk, but the agent won't be told about{" "}
                {savedFileChangesPronoun}.
              </>
            )}
          </>
        )
      }
      subMessage={
        hasOnlySavedFileChanges
          ? "To tell the agent what changed, use Send Feedback instead."
          : "To send this feedback, use Send Feedback instead."
      }
      confirmText={isApproving ? "Approve Anyway" : "Close Anyway"}
      cancelText="Cancel"
      variant="warning"
      showCancel
    />
  );
}

function SharedDocumentLoadErrorDialog({
  model,
  actions,
}: {
  readonly model: EditorDialogsModel;
  readonly actions: EditorDialogsActions;
}) {
  return (
    <ConfirmDialog
      isOpen={model.shareLoadError !== null && !model.isApiMode}
      onClose={actions.onClearShareLoadError}
      title="Shared Document Could Not Be Loaded"
      message={model.shareLoadError ?? ""}
      subMessage="You are viewing a demo document. This is sample content — it is not your data or anyone else's."
      variant="warning"
    />
  );
}
