import { describe, test, expect } from "bun:test";
import {
  annotateFileFeedback,
  annotateMessageFeedback,
  annotationFeedback,
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
