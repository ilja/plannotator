import { type ComponentProps } from "react";
import type { Origin } from "@plannotator/shared/agents";
import { ConfirmDialog } from "@plannotator/ui/components/ConfirmDialog";
import { DiffTypeSetupDialog } from "@plannotator/ui/components/DiffTypeSetupDialog";
import { LookAndFeelAnnouncementDialog } from "@plannotator/ui/components/LookAndFeelAnnouncementDialog";
import { Settings } from "@plannotator/ui/components/Settings";
import type { PlatformReviewAction } from "../hooks/usePlatformReviewActions";
import { ReviewSubmissionDialog, type ReviewSubmission } from "./ReviewSubmissionDialog";

type ReviewSettingsProps = ComponentProps<typeof Settings>;

/** Recovered review state available for restoration. */
export interface ReviewDraftRecovery {
  readonly count: number;
  readonly viewedCount: number;
  readonly timeAgo: string;
}

/** A prepared platform review submission awaiting reviewer confirmation. */
export interface ReviewPlatformSubmission {
  readonly action: PlatformReviewAction;
  readonly plan: ReviewSubmission;
}

/** Read-only display data for review dialogs. */
export interface ReviewDialogsModel {
  readonly draftRecovery: ReviewDraftRecovery | null;
  readonly origin: Origin | null;
  readonly aiProviders: ReviewSettingsProps["aiProviders"];
  readonly gitUser: string | undefined;
  readonly isSettingsOpen: boolean;
  readonly isPullRequestReview: boolean;
  readonly worktreePath: string | null;
  readonly isWorktreeDialogOpen: boolean;
  readonly isNoAnnotationsDialogOpen: boolean;
  readonly annotationCount: number;
  readonly isApproveWarningOpen: boolean;
  readonly isExitWarningOpen: boolean;
  readonly isLookAndFeelAnnouncementOpen: boolean;
  readonly gridEnabled: boolean;
  readonly isDiffTypeSetupOpen: boolean;
  readonly platformSubmission: ReviewPlatformSubmission | null;
  readonly platformGeneralComment: string;
  readonly platformOpenPR: boolean;
  readonly isPlatformSubmitting: boolean;
}

/** Dialog actions retained by ReviewApp, which owns every review state transition. */
export interface ReviewDialogsActions {
  readonly onDismissDraftRecovery: () => void;
  readonly onRestoreDraftRecovery: () => void;
  readonly onIdentityChange: ReviewSettingsProps["onIdentityChange"];
  readonly onCloseSettings: () => void;
  readonly onCloseWorktreeDialog: () => void;
  readonly onCopyWorktreePath: () => void;
  readonly onCloseNoAnnotationsDialog: () => void;
  readonly onCloseApproveWarning: () => void;
  readonly onConfirmApproveWarning: () => void;
  readonly onCloseExitWarning: () => void;
  readonly onConfirmExitWarning: () => void;
  readonly onToggleGrid: (enabled: boolean) => void;
  readonly onDismissLookAndFeelAnnouncement: () => void;
  readonly onCompleteDiffTypeSetup: (diffType: string) => void;
  readonly onChangePlatformGeneralComment: (comment: string) => void;
  readonly onChangePlatformOpenPR: (openPR: boolean) => void;
  readonly onConfirmPlatformSubmission: () => void;
  readonly onCancelPlatformSubmission: () => void;
}

/** Renders review dialogs from read-only data and ReviewApp-owned actions. */
export function ReviewDialogs({
  model,
  actions,
}: {
  readonly model: ReviewDialogsModel;
  readonly actions: ReviewDialogsActions;
}) {
  return (
    <>
      <DraftRecoveryDialog model={model} actions={actions} />
      <ReviewSettingsDialog model={model} actions={actions} />
      <LocalWorktreeDialog model={model} actions={actions} />
      <NoAnnotationsDialog model={model} actions={actions} />
      <AnnotationLossWarnings model={model} actions={actions} />
      <ReviewLookAndFeelAnnouncement model={model} actions={actions} />
      <ReviewDiffTypeSetupDialog model={model} actions={actions} />
      <PlatformReviewSubmissionDialog model={model} actions={actions} />
    </>
  );
}

function DraftRecoveryDialog({
  model,
  actions,
}: {
  readonly model: ReviewDialogsModel;
  readonly actions: ReviewDialogsActions;
}) {
  return (
    <ConfirmDialog
      isOpen={model.draftRecovery !== null}
      onClose={actions.onDismissDraftRecovery}
      onConfirm={actions.onRestoreDraftRecovery}
      title="Draft Recovered"
      message={getReviewDraftRecoveryMessage(model.draftRecovery)}
      confirmText="Restore"
      cancelText="Dismiss"
      showCancel
    />
  );
}

function getReviewDraftRecoveryMessage(draftRecovery: ReviewDraftRecovery | null): string {
  if (!draftRecovery) return "";

  const parts: string[] = [];

  if (draftRecovery.count > 0) {
    parts.push(`${draftRecovery.count} annotation${draftRecovery.count !== 1 ? "s" : ""}`);
  }

  if (draftRecovery.viewedCount > 0) {
    parts.push(
      `${draftRecovery.viewedCount} viewed file${draftRecovery.viewedCount !== 1 ? "s" : ""}`,
    );
  }

  return `Found ${parts.join(" and ")} from ${draftRecovery.timeAgo}. Would you like to restore them?`;
}

function ReviewSettingsDialog({
  model,
  actions,
}: {
  readonly model: ReviewDialogsModel;
  readonly actions: ReviewDialogsActions;
}) {
  return (
    <div className="hidden" aria-hidden="true">
      <Settings
        onIdentityChange={actions.onIdentityChange}
        origin={model.origin}
        mode="review"
        aiProviders={model.aiProviders}
        gitUser={model.gitUser}
        externalOpen={model.isSettingsOpen}
        onExternalClose={actions.onCloseSettings}
      />
    </div>
  );
}

function LocalWorktreeDialog({
  model,
  actions,
}: {
  readonly model: ReviewDialogsModel;
  readonly actions: ReviewDialogsActions;
}) {
  if (!model.isPullRequestReview || !model.worktreePath) return null;

  return (
    <ConfirmDialog
      isOpen={model.isWorktreeDialogOpen}
      onClose={actions.onCloseWorktreeDialog}
      title="Local Worktree"
      wide
      message={
        <div className="space-y-3">
          <p>This PR is checked out locally so file actions can use the checked-out source.</p>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
              Path
            </span>
            <button
              onClick={actions.onCopyWorktreePath}
              className="mt-1 w-full text-left font-mono text-xs bg-muted/50 border border-border/50 rounded-md px-3 py-2 text-foreground hover:bg-muted transition-colors cursor-pointer break-all"
              title="Click to copy"
            >
              {model.worktreePath}
            </button>
          </div>
          <p className="text-xs text-muted-foreground/60">
            Automatically removed when this review session ends.
          </p>
        </div>
      }
      variant="info"
    />
  );
}

function NoAnnotationsDialog({
  model,
  actions,
}: {
  readonly model: ReviewDialogsModel;
  readonly actions: ReviewDialogsActions;
}) {
  return (
    <ConfirmDialog
      isOpen={model.isNoAnnotationsDialogOpen}
      onClose={actions.onCloseNoAnnotationsDialog}
      title="No Annotations"
      message="You haven't made any annotations yet. There's nothing to copy."
      variant="info"
    />
  );
}

function AnnotationLossWarnings({
  model,
  actions,
}: {
  readonly model: ReviewDialogsModel;
  readonly actions: ReviewDialogsActions;
}) {
  return (
    <>
      <ConfirmDialog
        isOpen={model.isApproveWarningOpen}
        onClose={actions.onCloseApproveWarning}
        onConfirm={actions.onConfirmApproveWarning}
        title="Annotations Won't Be Sent"
        message={<AnnotationLossMessage annotationCount={model.annotationCount} action="approve" />}
        subMessage="To send your feedback, use Send Feedback instead."
        confirmText="Approve Anyway"
        cancelText="Cancel"
        variant="warning"
        showCancel
      />
      <ConfirmDialog
        isOpen={model.isExitWarningOpen}
        onClose={actions.onCloseExitWarning}
        onConfirm={actions.onConfirmExitWarning}
        title="Annotations Won't Be Sent"
        message={<AnnotationLossMessage annotationCount={model.annotationCount} action="close" />}
        subMessage="To send your feedback, use Send Feedback instead."
        confirmText="Close Anyway"
        cancelText="Cancel"
        variant="warning"
        showCancel
      />
    </>
  );
}

function AnnotationLossMessage({
  annotationCount,
  action,
}: {
  readonly annotationCount: number;
  readonly action: "approve" | "close";
}) {
  return (
    <>
      You have {annotationCount} annotation{annotationCount !== 1 ? "s" : ""} that will be lost if
      you {action}.
    </>
  );
}

function ReviewLookAndFeelAnnouncement({
  model,
  actions,
}: {
  readonly model: ReviewDialogsModel;
  readonly actions: ReviewDialogsActions;
}) {
  return (
    <LookAndFeelAnnouncementDialog
      isOpen={model.isLookAndFeelAnnouncementOpen}
      gridEnabled={model.gridEnabled}
      onToggleGrid={actions.onToggleGrid}
      onDismiss={actions.onDismissLookAndFeelAnnouncement}
    />
  );
}

function ReviewDiffTypeSetupDialog({
  model,
  actions,
}: {
  readonly model: ReviewDialogsModel;
  readonly actions: ReviewDialogsActions;
}) {
  if (!model.isDiffTypeSetupOpen || model.isLookAndFeelAnnouncementOpen) return null;

  return <DiffTypeSetupDialog onComplete={actions.onCompleteDiffTypeSetup} />;
}

function PlatformReviewSubmissionDialog({
  model,
  actions,
}: {
  readonly model: ReviewDialogsModel;
  readonly actions: ReviewDialogsActions;
}) {
  const submission = model.platformSubmission;

  return (
    <ReviewSubmissionDialog
      isOpen={submission !== null}
      action={submission?.action ?? "comment"}
      submission={submission?.plan ?? { targets: [], orphans: [] }}
      generalComment={model.platformGeneralComment}
      onGeneralCommentChange={actions.onChangePlatformGeneralComment}
      platformOpenPR={model.platformOpenPR}
      onPlatformOpenPRChange={actions.onChangePlatformOpenPR}
      onConfirm={actions.onConfirmPlatformSubmission}
      onCancel={actions.onCancelPlatformSubmission}
      isSubmitting={model.isPlatformSubmitting}
    />
  );
}
