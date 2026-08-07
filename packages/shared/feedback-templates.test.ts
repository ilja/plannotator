import { describe, test, expect } from "bun:test";
import {
  annotateFileFeedback,
  annotateMessageFeedback,
  annotationFeedback,
  appendFeedbackDiscussionInstruction,
  FEEDBACK_DISCUSSION_INSTRUCTION,
} from "./feedback-templates";

describe("feedback-templates", () => {
  test("annotation feedback preserves feedback content verbatim", () => {
    const feedback = "## 1. Change intro\n**From:**\n```\nold text\n```\n**To:**\n```\nnew text\n```";
    const result = annotationFeedback(feedback);

    expect(result).toContain("# Annotation Feedback");
    expect(result).toContain(feedback);
    expect(result).toContain("Please address the annotation feedback above.");
  });

  test("annotation feedback handles empty feedback gracefully", () => {
    const result = annotationFeedback("");

    expect(result).toContain("Annotation feedback requested.");
    expect(result).toBe(result.trimEnd());
  });

  test("annotation feedback tells the agent to discuss unclear feedback first", () => {
    const results = [
      annotationFeedback("Review this."),
      annotateFileFeedback("Review this.", { filePath: "/repo/README.md" }),
      annotateMessageFeedback("Review this."),
    ];

    for (const result of results) {
      expect(result).toContain(FEEDBACK_DISCUSSION_INSTRUCTION);
    }

    const instruction = results[0];
    expect(instruction).toContain("If any comment contains a question or is ambiguous, do not make any changes, including changes requested by clear comments.");
    expect(instruction).toContain("Discuss the unclear comments with me and wait for my response.");
    expect(instruction).toContain("Only start making changes after we have reached a shared understanding of every comment.");
    expect(instruction).toContain("If no comment contains a question and none is ambiguous, apply the feedback.");
  });

  test("does not duplicate the discussion instruction", () => {
    const prompt = `Base prompt\n\n${FEEDBACK_DISCUSSION_INSTRUCTION}`;

    expect(appendFeedbackDiscussionInstruction(prompt)).toBe(prompt);
  });

  test("annotate file feedback mirrors the runtime file prompt shape", () => {
    const result = annotateFileFeedback("Fix the intro", {
      fileHeader: "File",
      filePath: "/repo/README.md",
    });

    expect(result).toContain("# Markdown Annotations");
    expect(result).toContain("File: /repo/README.md");
    expect(result).toContain("Fix the intro");
    expect(result).toContain("Please address the annotation feedback above.");
  });

  test("annotate message feedback mirrors the runtime message prompt shape", () => {
    const result = annotateMessageFeedback("Wrong conclusion");

    expect(result).toContain("# Message Annotations");
    expect(result).toContain("Wrong conclusion");
    expect(result).toContain("Please address the annotation feedback above.");
  });
});
