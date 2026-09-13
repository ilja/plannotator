/**
 * Compile-time invariants for `DiffResult` (never imported at runtime).
 * Not a `*.test.ts` file so the `@ts-expect-error` assertions stay
 * compiler-checked.
 */

import type { DiffResult } from "./review-core.ts";

// Also rejects variable-mediated assignments, not just literals.

const _smuggled = { patch: "diff --git", label: "L", error: "boom" };

// @ts-expect-error — error with a non-empty patch via variable
const _badVariable: DiffResult = _smuggled;

// @ts-expect-error — error with a non-empty patch via literal
const _badLiteral: DiffResult = { patch: "diff --git", label: "L", error: "boom" };

// NOTE: `{ error: undefined }` explicitly still compiles (no
// exactOptionalPropertyTypes), so the two 400-response sites guard with
// `result.error !== undefined` as well as `"error" in result`. No producer
// emits that shape; the guard is defense in depth.

const _okEmpty: DiffResult = { patch: "", label: "Clean" };

const _okPatch: DiffResult = { patch: "diff --git", label: "Changes" };

const _err: DiffResult = { patch: "", label: "Failed", error: "boom" };
