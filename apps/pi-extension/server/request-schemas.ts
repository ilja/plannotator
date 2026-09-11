/**
 * HTTP request-boundary schemas shared across the node server handlers.
 * Each schema owns the wire representation of one endpoint request body;
 * handlers decode with them instead of narrowing parsed JSON manually.
 */

import { Option, Schema } from "effect";

/** DiffType wire union (generated/review-core.ts) used by review payloads. */
export const DiffTypeSchema = Schema.Union([
  Schema.Literals([
    "uncommitted",
    "staged",
    "unstaged",
    "last-commit",
    "branch",
    "merge-base",
    "all",
  ]),
  Schema.TemplateLiteral(["worktree:", Schema.String]),
]);

/** Diff switch request — DiffType plus the workspace-mode variants. */
export const WorkspaceDiffTypeSchema = Schema.Literals([
  "workspace-current",
  "workspace-staged",
  "workspace-unstaged",
  "workspace-last",
]);

export const DiffSwitchRequestSchema = Schema.Struct({
  diffType: Schema.Union([DiffTypeSchema, WorkspaceDiffTypeSchema]),
  hideWhitespace: Schema.optionalKey(Schema.Boolean),
  base: Schema.optionalKey(Schema.String),
});

/** PR diff scope switch request. */
export const PrDiffScopeRequestSchema = Schema.Struct({
  scope: Schema.Literals(["layer", "full-stack"]),
});

/** PR switch request. */
export const PrSwitchRequestSchema = Schema.Struct({
  url: Schema.NonEmptyString,
});

const PRReviewFileCommentSchema = Schema.Struct({
  path: Schema.String,
  line: Schema.Number,
  side: Schema.Literals(["LEFT", "RIGHT"]),
  body: Schema.String,
  start_line: Schema.optionalKey(Schema.Number),
  start_side: Schema.optionalKey(Schema.Literals(["LEFT", "RIGHT"])),
});

/** PR review submission request. */
export const PrActionRequestSchema = Schema.Struct({
  action: Schema.Literals(["approve", "comment"]),
  body: Schema.String,
  fileComments: Schema.optionalKey(Schema.Array(PRReviewFileCommentSchema)),
  targetPrUrl: Schema.optionalKey(Schema.String),
});

/** Open-in-app request (annotate and review servers). */
export const OpenInRequestSchema = Schema.Struct({
  filePath: Schema.NonEmptyString,
  appId: Schema.optionalKey(Schema.String),
  base: Schema.optionalKey(Schema.String),
});

/** Editor annotation request from a VS Code integration. */
export const EditorAnnotationRequestSchema = Schema.Struct({
  filePath: Schema.String,
  selectedText: Schema.String,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
});

/** Feedback request (annotate and review servers). */
export const FeedbackRequestSchema = Schema.Struct({
  feedback: Schema.optionalKey(Schema.String),
  annotations: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  approved: Schema.optionalKey(Schema.Boolean),
  selectedMessageId: Schema.optionalKey(Schema.String),
  feedbackScope: Schema.optionalKey(Schema.Literals(["message", "messages"])),
  draftGeneration: Schema.optionalKey(Schema.Natural),
});

const FeedbackRequestRecordSchema = Schema.Record(Schema.String, Schema.Unknown);

const decodeFeedbackRequestRecord = Schema.decodeUnknownOption(FeedbackRequestRecordSchema);

const decodeFeedbackRequestSchema = Schema.decodeUnknownOption(FeedbackRequestSchema);

export function decodeFeedbackRequest<Input>(
  value: Input,
): Schema.Schema.Type<typeof FeedbackRequestSchema> | undefined {
  const record = Option.getOrUndefined(decodeFeedbackRequestRecord(value));

  if (!record) return undefined;

  return Option.getOrUndefined(decodeFeedbackRequestSchema(record));
}

/** Code navigation request. */
export const CodeNavRequestSchema = Schema.Struct({
  symbol: Schema.String,
  filePath: Schema.String,
  line: Schema.Number,
  charStart: Schema.Number,
  side: Schema.Literals(["old", "new"]),
  language: Schema.optionalKey(Schema.String),
});

/** Viewed-file synchronization request. */
export const PrViewedRequestSchema = Schema.Struct({
  filePaths: Schema.Array(Schema.String),
  viewed: Schema.Boolean,
});

/** Git staging request. */
export const GitAddRequestSchema = Schema.Struct({
  filePath: Schema.NonEmptyString,
  undo: Schema.optionalKey(Schema.Boolean),
});
