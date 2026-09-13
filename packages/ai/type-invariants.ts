/**
 * Compile-time invariants (never imported at runtime). Not a `*.test.ts`
 * file so the `@ts-expect-error` assertions stay compiler-checked.
 */

import type { AIResultMessage, CodeReviewContext } from "./types.ts";

// Also rejects variable-mediated assignments, not just literals.

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

// Failures travel as `type: "error"` messages.

const _badResult: AIResultMessage = {
  type: "result",
  sessionId: "s",
  // @ts-expect-error — success is always true; reported at the property for literals
  success: false,
};

const _smuggledResult = { type: "result", sessionId: "s", success: false };

// @ts-expect-error — success is always true, even via variable
const _badSmuggledResult: AIResultMessage = _smuggledResult;

const _okUnscoped: CodeReviewContext = { patch: "+x" };

const _okFile: CodeReviewContext = { patch: "+x", filePath: "a.ts" };

const _okScoped: CodeReviewContext = {
  patch: "+x",
  filePath: "a.ts",
  lineRange: { start: 1, end: 2, side: "new" },
};

const _okResult: AIResultMessage = { type: "result", sessionId: "s", success: true };
