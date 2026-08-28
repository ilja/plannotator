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
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const sendFeedback = useCallback(async (): Promise<void> => {
    if (totalAnnotationCount === 0) {
      onNoAnnotations();
      return;
    }
    setIsSendingFeedback(true);
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
      setIsSendingFeedback(false);
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
    setIsExiting(true);
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
      setIsExiting(false);
    }
  }, [getDraftGeneration, onSubmitted]);

  const approveReview = useCallback(async (): Promise<void> => {
    setIsApproving(true);
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
      setIsApproving(false);
    }
  }, [getDraftGeneration, onFeedbackStatusChange, onSubmitted]);

  return {
    isSendingFeedback,
    isApproving,
    isExiting,
    sendFeedback,
    approveReview,
    exitReview,
  };
}
