import { Schema } from "effect";

/**
 * HTTP request-boundary schemas shared by the Bun and Node review servers
 * (Node consumes them via the `generated/` vendor copy).
 */

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

const PRReviewFileCommentSchema = Schema.Struct({
  path: Schema.String,
  line: Schema.Number,
  side: Schema.Literals(["LEFT", "RIGHT"]),
  body: Schema.String,
  start_line: Schema.optionalKey(Schema.Number),
  start_side: Schema.optionalKey(Schema.Literals(["LEFT", "RIGHT"])),
});

export const PrActionRequestSchema = Schema.Struct({
  action: Schema.Literals(["approve", "comment"]),
  body: Schema.String,
  fileComments: Schema.optionalKey(Schema.Array(PRReviewFileCommentSchema)),
  targetPrUrl: Schema.optionalKey(Schema.String),
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

/** Editor annotation request from a VS Code integration. */
export const EditorAnnotationRequestSchema = Schema.Struct({
  filePath: Schema.String,
  selectedText: Schema.String,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
});

/** `base` is null when the client has no base directory. */
export const OpenInRequestSchema = Schema.Struct({
  filePath: Schema.NonEmptyString,
  appId: Schema.optionalKey(Schema.String),
  base: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

export type OpenInRequest = Schema.Schema.Type<typeof OpenInRequestSchema>;
