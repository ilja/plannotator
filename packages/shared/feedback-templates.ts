/**
 * Shared feedback templates for retained annotation flows.
 *
 * IMPORTANT: This module is imported by packages/ui/utils/parser.ts which is
 * bundled into the browser SPA. It must NOT import from ./prompts or ./config
 * (which depend on node:fs, node:os, node:child_process). Keep it self-contained.
 */

export interface AnnotateFileFeedbackOptions {
  filePath: string;
  fileHeader?: "File" | "Folder" | string;
}

/** Annotation-only prompt rule for questions or ambiguous feedback. */
export const FEEDBACK_DISCUSSION_INSTRUCTION =
  "Before making changes, review all feedback. If any comment contains a question or is ambiguous, do not make any changes, including changes requested by clear comments. Discuss the unclear comments with me and wait for my response. Only start making changes after we have reached a shared understanding of every comment. If no comment contains a question and none is ambiguous, apply the feedback.";

/** Add the mandatory discussion instruction to a feedback prompt. */
export const appendFeedbackDiscussionInstruction = (prompt: string): string => {
  const trimmedPrompt = prompt.trimEnd();
  if (trimmedPrompt.endsWith(FEEDBACK_DISCUSSION_INSTRUCTION)) return trimmedPrompt;
  return `${trimmedPrompt}\n\n${FEEDBACK_DISCUSSION_INSTRUCTION}`;
};

export const annotationFeedback = (feedback: string): string =>
  appendFeedbackDiscussionInstruction(
    `# Annotation Feedback\n\n${feedback || "Annotation feedback requested."}\n\nPlease address the annotation feedback above.`,
  );

export const annotateFileFeedback = (
  feedback: string,
  options: AnnotateFileFeedbackOptions,
): string => {
  const fileHeader = options.fileHeader ?? "File";
  return appendFeedbackDiscussionInstruction(
    `# Markdown Annotations\n\n${fileHeader}: ${options.filePath}\n\n${feedback}\n\nPlease address the annotation feedback above.`,
  );
};

export const annotateMessageFeedback = (feedback: string): string =>
  appendFeedbackDiscussionInstruction(
    `# Message Annotations\n\n${feedback}\n\nPlease address the annotation feedback above.`,
  );
