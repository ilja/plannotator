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

export const annotationFeedback = (feedback: string): string =>
  `# Annotation Feedback\n\n${feedback || "Annotation feedback requested."}\n\nPlease address the annotation feedback above.`;

export const annotateFileFeedback = (
  feedback: string,
  options: AnnotateFileFeedbackOptions,
): string => {
  const fileHeader = options.fileHeader ?? "File";
  return `# Markdown Annotations\n\n${fileHeader}: ${options.filePath}\n\n${feedback}\n\nPlease address the annotation feedback above.`;
};

export const annotateMessageFeedback = (feedback: string): string =>
  `# Message Annotations\n\n${feedback}\n\nPlease address the annotation feedback above.`;
