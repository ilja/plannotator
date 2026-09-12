/**
 * Compile-time invariants for AI message and context shapes.
 *
 * This module is intentionally not a `*.test.ts` file: test files are
 * excluded from `tsc --noEmit`, while these `@ts-expect-error` assertions
 * must be compiler-checked to mean anything. It is never imported at
 * runtime.
 */

import type { AIResultMessage, CodeReviewContext } from "./types.ts";

// A line range without a file is unrepresentable, even when smuggled through
// an intermediate variable (the `lineRange?: never` arm closes the
// structural loophole, not just literals).

const _smuggledRange = {
  patch: "+x",
  lineRange: { start: 1, end: 2, side: "new" as const },
};

// @ts-expect-error — lineRange without filePath via variable
const _badVariable: CodeReviewContext = _smuggledRange;

// @ts-expect-error — lineRange without filePath via literal
const _badLiteral: CodeReviewContext = {
  patch: "+x",
  lineRange: { start: 1, end: 2, side: "new" },
};

// A `success: false` result is unrepresentable: failures travel as
// `type: "error"` messages, never here.

const _badResult: AIResultMessage = {
  type: "result",
  sessionId: "s",
  // @ts-expect-error — success is always true; reported at the property for literals
  success: false,
};

const _smuggledResult = { type: "result", sessionId: "s", success: false };

// @ts-expect-error — success is always true, even via variable
const _badSmuggledResult: AIResultMessage = _smuggledResult;

// Valid states still constructible.

const _okUnscoped: CodeReviewContext = { patch: "+x" };

const _okFile: CodeReviewContext = { patch: "+x", filePath: "a.ts" };

const _okScoped: CodeReviewContext = {
  patch: "+x",
  filePath: "a.ts",
  lineRange: { start: 1, end: 2, side: "new" },
};

const _okResult: AIResultMessage = { type: "result", sessionId: "s", success: true };
