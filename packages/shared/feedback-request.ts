import { Option, Schema } from "effect";

/**
 * Feedback request bodies, split per endpoint.
 *
 * Unknown excess keys are stripped (Effect default) so newer client fields
 * never break older servers, while cross-endpoint keys are rejected via
 * `Never` arms. Decoding discards mismatch details: every route maps
 * failure to the same 400.
 */

const DraftGenerationField = Schema.optionalKey(Schema.Natural);

const AnnotationsField = Schema.optionalKey(Schema.Array(Schema.Unknown));

const NoReviewScope = {
  selectedMessageId: Schema.optionalKey(Schema.Never),
  feedbackScope: Schema.optionalKey(Schema.Never),
} as const;

const NoApproval = {
  approved: Schema.optionalKey(Schema.Never),
} as const;

const ReviewApprovalSchema = Schema.Struct({
  approved: Schema.Literal(true),
  feedback: Schema.optionalKey(Schema.String),
  annotations: AnnotationsField,
  draftGeneration: DraftGenerationField,
  ...NoReviewScope,
});

const ReviewCommentSchema = Schema.Struct({
  approved: Schema.optionalKey(Schema.Literal(false)),
  feedback: Schema.NonEmptyString,
  annotations: AnnotationsField,
  draftGeneration: DraftGenerationField,
  ...NoReviewScope,
});

const ReviewAnnotatedSchema = Schema.Struct({
  approved: Schema.optionalKey(Schema.Literal(false)),
  feedback: Schema.optionalKey(Schema.String),
  annotations: Schema.NonEmptyArray(Schema.Unknown),
  draftGeneration: DraftGenerationField,
  ...NoReviewScope,
});

export const ReviewFeedbackRequestSchema = Schema.Union([
  ReviewApprovalSchema,
  ReviewCommentSchema,
  ReviewAnnotatedSchema,
]);

export type ReviewFeedbackRequest = Schema.Schema.Type<typeof ReviewFeedbackRequestSchema>;

const AnnotateCommentSchema = Schema.Struct({
  feedback: Schema.NonEmptyString,
  annotations: AnnotationsField,
  selectedMessageId: Schema.optionalKey(Schema.String),
  feedbackScope: Schema.optionalKey(Schema.Literals(["message", "messages"])),
  draftGeneration: DraftGenerationField,
  ...NoApproval,
});

const AnnotateAnnotatedSchema = Schema.Struct({
  feedback: Schema.optionalKey(Schema.String),
  annotations: Schema.NonEmptyArray(Schema.Unknown),
  selectedMessageId: Schema.optionalKey(Schema.String),
  feedbackScope: Schema.optionalKey(Schema.Literals(["message", "messages"])),
  draftGeneration: DraftGenerationField,
  ...NoApproval,
});

export const AnnotateFeedbackRequestSchema = Schema.Union([
  AnnotateCommentSchema,
  AnnotateAnnotatedSchema,
]);

export type AnnotateFeedbackRequest = Schema.Schema.Type<typeof AnnotateFeedbackRequestSchema>;

export function decodeReviewFeedbackRequest<Input>(
  value: Input,
): ReviewFeedbackRequest | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(ReviewFeedbackRequestSchema)(value));
}

export function decodeAnnotateFeedbackRequest<Input>(
  value: Input,
): AnnotateFeedbackRequest | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(AnnotateFeedbackRequestSchema)(value));
}
