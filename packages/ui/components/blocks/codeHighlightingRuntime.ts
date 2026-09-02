import { Effect, Layer, ManagedRuntime } from "effect";
import * as Fiber from "effect/Fiber";
import {
  CodeHighlightingLive,
  CodeHighlightingService,
  type HighlightResult,
} from "./codeHighlighting";

/**
 * Application-scoped runtime for code highlighting.
 * Built once, shared across all CodeBlock instances.
 * Do not construct per component.
 */

let runtime: ManagedRuntime.ManagedRuntime<CodeHighlightingService, unknown> | null = null;
let layer: Layer.Layer<CodeHighlightingService, unknown, never> | null = null;

function getLayer(): Layer.Layer<CodeHighlightingService, unknown, never> {
  if (!layer) {
    // SAFETY: CodeHighlightingLive error channel widens from HighlightProviderError to unknown at runtime boundary
    layer = CodeHighlightingLive as Layer.Layer<CodeHighlightingService, unknown, never>;
  }
  return layer;
}

export function getCodeHighlightingRuntime(): ManagedRuntime.ManagedRuntime<
  CodeHighlightingService,
  unknown
> {
  if (!runtime) {
    runtime = ManagedRuntime.make(getLayer());
  }
  return runtime;
}

/**
 * For tests: replace the runtime with a test layer.
 * Returns the previous runtime for restoration.
 */
export function setCodeHighlightingRuntimeForTest(
  testRuntime: ManagedRuntime.ManagedRuntime<CodeHighlightingService, unknown> | null,
): ManagedRuntime.ManagedRuntime<CodeHighlightingService, unknown> | null {
  const prev = runtime;
  runtime = testRuntime;
  return prev;
}

export function setCodeHighlightingLayerForTest(
  testLayer: Layer.Layer<CodeHighlightingService, unknown, never> | null,
): Layer.Layer<CodeHighlightingService, unknown, never> | null {
  const prev = layer;
  layer = testLayer;
  // Invalidate runtime so next get creates from new layer
  if (runtime) {
    // fire and forget dispose – tests should dispose manually if needed
    void runtime.dispose();
    runtime = null;
  }
  return prev;
}

export async function disposeCodeHighlightingRuntime(): Promise<void> {
  if (runtime) {
    const r = runtime;
    runtime = null;
    await r.dispose();
  }
  if (layer) {
    layer = null;
  }
}

/**
 * Convenience: run highlight effect via the shared runtime and return a Fiber.
 * Caller is responsible for interruption via Fiber.interrupt.
 */
export function runHighlightFork(input: {
  code: string;
  language: string | undefined;
  themeName: string;
}): Effect.Effect<Fiber.Fiber<HighlightResult, never>, never, CodeHighlightingService> {
  return Effect.gen(function* () {
    const svc = yield* CodeHighlightingService;
    return yield* svc.highlight(input).pipe(Effect.forkChild);
  });
}
