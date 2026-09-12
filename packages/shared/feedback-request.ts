import { Option, Schema } from "effect";

/**
 * Feedback request bodies, split per endpoint.
 *
 * Review and annotate feedback used to share one all-optional struct, which
 * made two impossible states representable: a contentless `{}` resolved a
 * decision that decided nothing (defaults filled approved=false and empty
 * feedback), and each endpoint silently stripped the other endpoint's fields
 * (`approved` on annotate, `selectedMessageId`/`feedbackScope` on review).
 * Clients always send full payloads, so the unions below accept every live
 * payload while rejecting contentless and cross-endpoint bodies.
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

/** Review approval: the decision is the approval; text and annotations are extras. */
const ReviewApprovalSchema = Schema.Struct({
  approved: Schema.Literal(true),
  feedback: Schema.optionalKey(Schema.String),
  annotations: AnnotationsField,
  draftGeneration: DraftGenerationField,
  ...NoReviewScope,
});

/** Review comment: without approval, the body must say something. */
const ReviewCommentSchema = Schema.Struct({
  approved: Schema.optionalKey(Schema.Literal(false)),
  feedback: Schema.NonEmptyString,
  annotations: AnnotationsField,
  draftGeneration: DraftGenerationField,
  ...NoReviewScope,
});

/** Review annotations-only feedback: the annotations are the content. */
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

/** Annotate feedback with words; scope fields stay optional modifiers. */
const AnnotateCommentSchema = Schema.Struct({
  feedback: Schema.NonEmptyString,
  annotations: AnnotationsField,
  selectedMessageId: Schema.optionalKey(Schema.String),
  feedbackScope: Schema.optionalKey(Schema.Literals(["message", "messages"])),
  draftGeneration: DraftGenerationField,
  ...NoApproval,
});

/** Annotate annotations-only feedback; scope fields stay optional modifiers. */
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

/** Decode a review `/api/feedback` body; undefined means 400 Invalid request. */
export function decodeReviewFeedbackRequest<Input>(
  value: Input,
): ReviewFeedbackRequest | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(ReviewFeedbackRequestSchema)(value));
}

/** Decode an annotate `/api/feedback` body; undefined means 400 Invalid request. */
export function decodeAnnotateFeedbackRequest<Input>(
  value: Input,
): AnnotateFeedbackRequest | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(AnnotateFeedbackRequestSchema)(value));
}
