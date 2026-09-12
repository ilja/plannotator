import { useCallback, useState } from "react";
import type { CodeAnnotation, EditorAnnotation } from "@plannotator/ui/types";
import { buildReviewFeedbackAnnotations } from "../utils/reviewFeedbackAnnotations";

export interface UseAgentReviewActionsOptions {
  allAnnotations: CodeAnnotation[];
  editorAnnotations: EditorAnnotation[];
  feedbackMarkdown: string;
  totalAnnotationCount: number;
  getDraftGeneration: () => number;
  onSubmitted: (submission: "approved" | "feedback" | "exited") => void;
  onFeedbackStatusChange: (status: string | null) => void;
  onNoAnnotations: () => void;
}

export interface AgentReviewActions {
  isSendingFeedback: boolean;
  isApproving: boolean;
  isExiting: boolean;
  sendFeedback: () => Promise<void>;
  approveReview: () => Promise<void>;
  exitReview: () => Promise<void>;
}

type PendingAgentAction = "feedback" | "approve" | "exit";

export function useAgentReviewActions({
  allAnnotations,
  editorAnnotations,
  feedbackMarkdown,
  totalAnnotationCount,
  getDraftGeneration,
  onSubmitted,
  onFeedbackStatusChange,
  onNoAnnotations,
}: UseAgentReviewActionsOptions): AgentReviewActions {
  // One submission lifecycle: the three actions share it, so two of them
  // can never be pending at once.
  const [pendingAction, setPendingAction] = useState<PendingAgentAction | null>(null);

  const sendFeedback = useCallback(async (): Promise<void> => {
    if (totalAnnotationCount === 0) {
      onNoAnnotations();

      return;
    }

    setPendingAction("feedback");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftGeneration: getDraftGeneration(),
          approved: false,
          feedback: feedbackMarkdown,
          annotations: buildReviewFeedbackAnnotations(allAnnotations, editorAnnotations),
        }),
      });

      if (response.ok) {
        onSubmitted("feedback");
      } else {
        throw new Error("Failed to send");
      }
    } catch (error) {
      console.error("Failed to send feedback:", error);
      onFeedbackStatusChange("Failed to send");
      setTimeout(() => onFeedbackStatusChange(null), 2000);
      setPendingAction(null);
    }
  }, [
    allAnnotations,
    editorAnnotations,
    feedbackMarkdown,
    getDraftGeneration,
    onFeedbackStatusChange,
    onNoAnnotations,
    onSubmitted,
    totalAnnotationCount,
  ]);

  const exitReview = useCallback(async (): Promise<void> => {
    setPendingAction("exit");

    try {
      const response = await fetch(`/api/exit?draftGeneration=${getDraftGeneration()}`, {
        method: "POST",
      });

      if (response.ok) {
        onSubmitted("exited");
      } else {
        throw new Error("Failed to exit");
      }
    } catch (error) {
      console.error("Failed to exit review:", error);
      setPendingAction(null);
    }
  }, [getDraftGeneration, onSubmitted]);

  const approveReview = useCallback(async (): Promise<void> => {
    setPendingAction("approve");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftGeneration: getDraftGeneration(),
          approved: true,
          feedback: "LGTM - no changes requested.",
          annotations: [],
        }),
      });

      if (response.ok) {
        onSubmitted("approved");
      } else {
        throw new Error("Failed to send");
      }
    } catch (error) {
      console.error("Failed to approve:", error);
      onFeedbackStatusChange("Failed to send");
      setTimeout(() => onFeedbackStatusChange(null), 2000);
      setPendingAction(null);
    }
  }, [getDraftGeneration, onFeedbackStatusChange, onSubmitted]);

  return {
    isSendingFeedback: pendingAction === "feedback",
    isApproving: pendingAction === "approve",
    isExiting: pendingAction === "exit",
    sendFeedback,
    approveReview,
    exitReview,
  };
}
