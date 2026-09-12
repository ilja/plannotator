import { Schema } from "effect";

/**
 * HTTP request-boundary schemas shared by the Bun and Node review servers
 * (Node consumes them via the `generated/` vendor copy).
 *
 * Each schema owns the wire representation of one endpoint request body;
 * handlers decode with them instead of narrowing parsed JSON manually.
 * The code-nav schemas stay per runtime: Bun's are deliberately loose
 * (validation-deferring) while Node's are strict — unifying them is a
 * behavior project of its own.
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

/**
 * PR review submission request. `fileComments` is optional: handlers default
 * an absent list to `[]`, so both runtimes accept submissions without
 * per-file comments.
 */
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
/** Editor annotation request from a VS Code integration. */
export const EditorAnnotationRequestSchema = Schema.Struct({
  filePath: Schema.String,
  selectedText: Schema.String,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
});

/**
 * Open-in-app request. `filePath` is always required (the UI disables the
 * button without one); `base` is explicitly null when the client has no
 * base directory, so both absent and null decode.
 */
export const OpenInRequestSchema = Schema.Struct({
  filePath: Schema.NonEmptyString,
  appId: Schema.optionalKey(Schema.String),
  base: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

export type OpenInRequest = Schema.Schema.Type<typeof OpenInRequestSchema>;
