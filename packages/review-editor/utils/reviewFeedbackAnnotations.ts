import type { EditorAnnotation } from "@plannotator/shared/types";
import type { CodeAnnotation } from "@plannotator/ui/types";

/** Build the complete annotation list submitted with code review feedback. */
export function buildReviewFeedbackAnnotations(
  annotations: CodeAnnotation[],
  editorAnnotations: EditorAnnotation[],
): Array<CodeAnnotation | EditorAnnotation> {
  return [...annotations, ...editorAnnotations];
}
