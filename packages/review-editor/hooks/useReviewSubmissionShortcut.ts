import { useEffect } from "react";
import type { ReviewSubmission } from "../components/ReviewSubmissionDialog";
import type { PlatformReviewAction } from "../utils/platformReviewSubmission";
import { isTypingTarget } from "./useReviewSearch";

type ReviewSubmissionShortcutAction =
  | "submit-platform-dialog"
  | "open-platform-approval"
  | "open-platform-comment"
  | "approve-agent-review"
  | "send-agent-feedback";

interface PlatformReviewDialog {
  action: PlatformReviewAction;
  plan: ReviewSubmission;
}

export interface ReviewSubmissionShortcutState {
  platformCommentDialog: PlatformReviewDialog | null;
  platformGeneralComment: string;
  submitted: boolean;
  isSendingFeedback: boolean;
  isApproving: boolean;
  isExiting: boolean;
  isPlatformActioning: boolean;
  isDemoMode: boolean;
  isPlatformMode: boolean;
  isOwnPullRequest: boolean;
  totalAnnotationCount: number;
  hasBlockingDialog: boolean;
}

export interface UseReviewSubmissionShortcutOptions extends ReviewSubmissionShortcutState {
  submitPlatformAction: (
    action: PlatformReviewAction,
    plan: ReviewSubmission,
    generalComment: string,
  ) => Promise<void>;
  openPlatformDialog: (action: PlatformReviewAction) => void;
  approveReview: () => Promise<void>;
  sendFeedback: () => Promise<void>;
}

export function getReviewSubmissionShortcutAction(
  state: ReviewSubmissionShortcutState,
): ReviewSubmissionShortcutAction | null {
  if (state.platformCommentDialog) {
    if (state.submitted || state.isPlatformActioning) return null;
    const canSubmit =
      state.platformCommentDialog.action === "approve" ||
      state.platformCommentDialog.plan.targets.length > 0 ||
      state.platformGeneralComment.trim().length > 0;
    return canSubmit ? "submit-platform-dialog" : null;
  }

  if (
    state.hasBlockingDialog ||
    state.submitted ||
    state.isSendingFeedback ||
    state.isApproving ||
    state.isExiting ||
    state.isPlatformActioning ||
    state.isDemoMode
  ) {
    return null;
  }

  if (state.isPlatformMode) {
    return state.totalAnnotationCount === 0 && !state.isOwnPullRequest
      ? "open-platform-approval"
      : "open-platform-comment";
  }

  return state.totalAnnotationCount === 0 ? "approve-agent-review" : "send-agent-feedback";
}

export function useReviewSubmissionShortcut({
  platformCommentDialog,
  platformGeneralComment,
  submitted,
  isSendingFeedback,
  isApproving,
  isExiting,
  isPlatformActioning,
  isDemoMode,
  isPlatformMode,
  isOwnPullRequest,
  totalAnnotationCount,
  hasBlockingDialog,
  submitPlatformAction,
  openPlatformDialog,
  approveReview,
  sendFeedback,
}: UseReviewSubmissionShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;

      const action = getReviewSubmissionShortcutAction({
        platformCommentDialog,
        platformGeneralComment,
        submitted,
        isSendingFeedback,
        isApproving,
        isExiting,
        isPlatformActioning,
        isDemoMode,
        isPlatformMode,
        isOwnPullRequest,
        totalAnnotationCount,
        hasBlockingDialog,
      });
      if (!action) return;
      if (action !== "submit-platform-dialog" && isTypingTarget(event.target)) return;

      event.preventDefault();
      if (action === "submit-platform-dialog") {
        if (!platformCommentDialog) return;
        void submitPlatformAction(
          platformCommentDialog.action,
          platformCommentDialog.plan,
          platformGeneralComment,
        );
      } else if (action === "open-platform-approval") {
        openPlatformDialog("approve");
      } else if (action === "open-platform-comment") {
        openPlatformDialog("comment");
      } else if (action === "approve-agent-review") {
        void approveReview();
      } else {
        void sendFeedback();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    approveReview,
    hasBlockingDialog,
    isApproving,
    isDemoMode,
    isExiting,
    isOwnPullRequest,
    isPlatformActioning,
    isPlatformMode,
    isSendingFeedback,
    openPlatformDialog,
    platformCommentDialog,
    platformGeneralComment,
    sendFeedback,
    submitPlatformAction,
    submitted,
    totalAnnotationCount,
  ]);
}
