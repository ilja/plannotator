/**
 * HTTP request-boundary schemas shared across the node server handlers.
 * Each schema owns the wire representation of one endpoint request body;
 * handlers decode with them instead of narrowing parsed JSON manually.
 */

import { Schema } from "effect";

/** DiffType wire union (generated/review-core.ts) used by review payloads. */
export const DiffTypeSchema = Schema.Union([
	Schema.Literals([
		"uncommitted", "staged", "unstaged", "last-commit",
		"jj-current", "jj-last", "jj-line", "jj-all", "jj-evolog",
		"branch", "merge-base", "all", "p4-default",
	]),
	Schema.TemplateLiteral(["worktree:", Schema.String]),
	Schema.TemplateLiteral(["p4-changelist:", Schema.String]),
]);

/** Diff switch request — DiffType plus the workspace-mode variants. */
export const DiffSwitchRequestSchema = Schema.Struct({
	diffType: Schema.Union([
		DiffTypeSchema,
		Schema.Literals([
			"workspace-current", "workspace-staged", "workspace-unstaged", "workspace-last",
		]),
	]),
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

/** Feedback request (annotate and review servers). */
export const FeedbackRequestSchema = Schema.Struct({
	feedback: Schema.optionalKey(Schema.String),
	annotations: Schema.optionalKey(Schema.Array(Schema.Unknown)),
	approved: Schema.optionalKey(Schema.Boolean),
	selectedMessageId: Schema.optionalKey(Schema.String),
	feedbackScope: Schema.optionalKey(Schema.Literals(["message", "messages"])),
	draftGeneration: Schema.optionalKey(Schema.Natural),
});