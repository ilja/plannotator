import { Option, Result, Schema } from "effect";
import type {
  PRCheck,
  PRComment,
  PRContext,
  PRLinkedIssue,
  PRReview,
  PRReviewThread,
  PRThreadComment,
} from "@plannotator/shared/pr-types";

type PRContextJsonValue = Schema.Schema.Type<typeof Schema.Json>;

const PRContextEnvelopeSchema = Schema.Struct({
  body: Schema.String,
  state: Schema.String,
  isDraft: Schema.Boolean,
  reviewDecision: Schema.String,
  mergeable: Schema.String,
  mergeStateStatus: Schema.String,
  labels: Schema.optionalKey(Schema.Json),
  comments: Schema.optionalKey(Schema.Json),
  reviews: Schema.optionalKey(Schema.Json),
  reviewThreads: Schema.optionalKey(Schema.Json),
  checks: Schema.optionalKey(Schema.Json),
  linkedIssues: Schema.optionalKey(Schema.Json),
});

type PRContextEnvelope = Schema.Schema.Type<typeof PRContextEnvelopeSchema>;

const PRLabelSchema = Schema.Struct({
  name: Schema.String,
  color: Schema.String,
});

const PRCommentSchema = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  body: Schema.String,
  createdAt: Schema.String,
  url: Schema.String,
});

const PRReviewSchema = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  state: Schema.String,
  body: Schema.String,
  submittedAt: Schema.String,
  url: Schema.optionalKey(Schema.String),
});

const PRThreadCommentSchema = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  body: Schema.String,
  createdAt: Schema.String,
  url: Schema.String,
  diffHunk: Schema.optionalKey(Schema.String),
});

const PRReviewThreadSchema = Schema.Struct({
  id: Schema.String,
  isResolved: Schema.Boolean,
  isOutdated: Schema.Boolean,
  path: Schema.String,
  line: Schema.NullOr(Schema.Number),
  startLine: Schema.NullOr(Schema.Number),
  diffSide: Schema.NullOr(Schema.Literals(["LEFT", "RIGHT"])),
  comments: Schema.optionalKey(Schema.Json),
});

const PRCheckSchema = Schema.Struct({
  name: Schema.String,
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
  workflowName: Schema.String,
  detailsUrl: Schema.String,
});

const PRLinkedIssueSchema = Schema.Struct({
  number: Schema.Number,
  url: Schema.String,
  repo: Schema.String,
});

const decodeContextEnvelope = Schema.decodeUnknownResult(PRContextEnvelopeSchema);
const decodeArray = Schema.decodeUnknownOption(Schema.Array(Schema.Json));
const decodeLabel = Schema.decodeUnknownOption(PRLabelSchema);
const decodeComment = Schema.decodeUnknownOption(PRCommentSchema);
const decodeReview = Schema.decodeUnknownOption(PRReviewSchema);
const decodeThreadComment = Schema.decodeUnknownOption(PRThreadCommentSchema);
const decodeReviewThread = Schema.decodeUnknownOption(PRReviewThreadSchema);
const decodeCheck = Schema.decodeUnknownOption(PRCheckSchema);
const decodeLinkedIssue = Schema.decodeUnknownOption(PRLinkedIssueSchema);
const decodeErrorEnvelope = Schema.decodeUnknownOption(
  Schema.Struct({
    error: Schema.optionalKey(Schema.Json),
  }),
);
const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeLabelItem = (value: PRContextJsonValue): PRContext["labels"][number] | undefined =>
  Option.getOrUndefined(decodeLabel(value));
const decodeCommentItem = (value: PRContextJsonValue): PRComment | undefined =>
  Option.getOrUndefined(decodeComment(value));
const decodeReviewItem = (value: PRContextJsonValue): PRReview | undefined =>
  Option.getOrUndefined(decodeReview(value));
const decodeThreadCommentItem = (value: PRContextJsonValue): PRThreadComment | undefined =>
  Option.getOrUndefined(decodeThreadComment(value));
const decodeCheckItem = (value: PRContextJsonValue): PRCheck | undefined =>
  Option.getOrUndefined(decodeCheck(value));
const decodeLinkedIssueItem = (value: PRContextJsonValue): PRLinkedIssue | undefined =>
  Option.getOrUndefined(decodeLinkedIssue(value));

function decodeArrayItems<T>(
  value: PRContextJsonValue | undefined,
  decodeItem: (item: PRContextJsonValue) => T | undefined,
): T[] {
  const items = Option.getOrUndefined(decodeArray(value));
  if (items === undefined) return [];

  return items.flatMap((item) => {
    const decoded = decodeItem(item);
    return decoded === undefined ? [] : [decoded];
  });
}

function decodeThread(value: PRContextJsonValue): PRReviewThread | undefined {
  const thread = Option.getOrUndefined(decodeReviewThread(value));
  if (thread === undefined) return undefined;

  return {
    ...thread,
    comments: decodeArrayItems(thread.comments, decodeThreadCommentItem),
  };
}

/** Decode the successful `/api/pr-context` response, retaining valid array siblings. */
export function decodePRContextResponse<Input>(value: Input): PRContext {
  const decoded = decodeContextEnvelope(value);
  if (Result.isFailure(decoded)) throw decoded.failure;

  const data: PRContextEnvelope = decoded.success;
  return {
    body: data.body,
    state: data.state,
    isDraft: data.isDraft,
    labels: decodeArrayItems(data.labels, decodeLabelItem),
    reviewDecision: data.reviewDecision,
    mergeable: data.mergeable,
    mergeStateStatus: data.mergeStateStatus,
    comments: decodeArrayItems(data.comments, decodeCommentItem),
    reviews: decodeArrayItems(data.reviews, decodeReviewItem),
    reviewThreads: decodeArrayItems(data.reviewThreads, decodeThread),
    checks: decodeArrayItems(data.checks, decodeCheckItem),
    linkedIssues: decodeArrayItems(data.linkedIssues, decodeLinkedIssueItem),
  };
}

/** Read only a string `error` from a non-OK `/api/pr-context` response body. */
export function decodePRContextError<Input>(value: Input): string | undefined {
  const envelope = Option.getOrUndefined(decodeErrorEnvelope(value));
  if (envelope === undefined) return undefined;
  return Option.getOrUndefined(decodeString(envelope.error));
}
