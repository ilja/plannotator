/**
 * Compile-time invariants for `DiffResult`.
 *
 * This module is intentionally not a `*.test.ts` file: test files are
 * excluded from `tsc --noEmit`, while these `@ts-expect-error` assertions
 * must be compiler-checked to mean anything. It is never imported at
 * runtime.
 */

import type { DiffResult } from "./review-core.ts";

// An error with a non-empty patch is unrepresentable, even when smuggled
// through an intermediate variable (structural, not just literal, check).

const _smuggled = { patch: "diff --git", label: "L", error: "boom" };

// @ts-expect-error — error with a non-empty patch via variable
const _badVariable: DiffResult = _smuggled;

// @ts-expect-error — error with a non-empty patch via literal
const _badLiteral: DiffResult = { patch: "diff --git", label: "L", error: "boom" };

// NOTE: `{ error: undefined }` explicitly still compiles (no
// exactOptionalPropertyTypes), so the two 400-response sites guard with
// `result.error !== undefined` as well as `"error" in result`. No producer
// emits that shape; the guard is defense in depth.

// Valid states still constructible.

const _okEmpty: DiffResult = { patch: "", label: "Clean" };

const _okPatch: DiffResult = { patch: "diff --git", label: "Changes" };

const _err: DiffResult = { patch: "", label: "Failed", error: "boom" };
