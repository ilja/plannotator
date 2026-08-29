/**
 * Bun review request-boundary schemas.
 *
 * Mirrors the verified Effect v4 forms from
 * `apps/pi-extension/server/request-schemas.ts` — do not import that
 * app-local module from this package; the dependency direction forbids it.
 * Each schema owns the wire representation of one endpoint request body;
 * handlers decode with them instead of narrowing parsed JSON manually.
 */

import { Schema } from "effect";

/** DiffType wire union used by review payloads. */
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

/** Workspace-mode diff variants. */
export const WorkspaceDiffTypeSchema = Schema.Literals([
  "workspace-current",
  "workspace-staged",
  "workspace-unstaged",
  "workspace-last",
]);

/** Diff switch request — DiffType plus the workspace-mode variants. */
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

/** Single PR review file comment — mirrors `PRReviewFileComment` fields. */
const PRReviewFileCommentSchema = Schema.Struct({
  path: Schema.String,
  line: Schema.Number,
  side: Schema.Literals(["LEFT", "RIGHT"]),
  body: Schema.String,
  start_line: Schema.optionalKey(Schema.Number),
  start_side: Schema.optionalKey(Schema.Literals(["LEFT", "RIGHT"])),
});

/** PR review submission request — fileComments is required on Bun. */
export const PrActionRequestSchema = Schema.Struct({
  action: Schema.Literals(["approve", "comment"]),
  body: Schema.String,
  fileComments: Schema.Array(PRReviewFileCommentSchema),
  targetPrUrl: Schema.optionalKey(Schema.String),
});

/** Feedback request (review server). */
export const FeedbackRequestSchema = Schema.Struct({
  feedback: Schema.optionalKey(Schema.String),
  annotations: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  approved: Schema.optionalKey(Schema.Boolean),
  selectedMessageId: Schema.optionalKey(Schema.String),
  feedbackScope: Schema.optionalKey(Schema.Literals(["message", "messages"])),
  draftGeneration: Schema.optionalKey(Schema.Natural),
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
