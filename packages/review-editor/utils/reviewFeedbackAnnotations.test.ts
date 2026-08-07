import { describe, expect, test } from "bun:test";
import type { EditorAnnotation } from "@plannotator/shared/types";
import { buildReviewFeedbackAnnotations } from "./reviewFeedbackAnnotations";

const editorAnnotation: EditorAnnotation = {
  id: "editor-1",
  filePath: "src/app.ts",
  selectedText: "const answer = 42;",
  lineStart: 1,
  lineEnd: 1,
  comment: "Is this value correct?",
  createdAt: 1,
};

describe("buildReviewFeedbackAnnotations", () => {
  test("includes editor-only annotations in the agent submission", () => {
    expect(buildReviewFeedbackAnnotations([], [editorAnnotation])).toEqual([editorAnnotation]);
  });
});
