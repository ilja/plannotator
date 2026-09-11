import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { CodeHighlightingService, makeTestLayer } from "./codeHighlighting";
import {
  disposeCodeHighlightingRuntime,
  getCodeHighlightingRuntime,
  setCodeHighlightingLayerForTest,
} from "./codeHighlightingRuntime";

describe("codeHighlightingRuntime", () => {
  test("creates one runtime serving multiple highlights", async () => {
    const testLayer = makeTestLayer({
      highlightImpl: (input) =>
        Effect.succeed({
          _tag: "Highlighted",
          lines: [[{ content: input.code, color: "#fff" }]],
        } as const),
    });

    setCodeHighlightingLayerForTest(testLayer);
    const rt1 = getCodeHighlightingRuntime();
    const rt2 = getCodeHighlightingRuntime();
    expect(rt1).toBe(rt2);

    const res1 = await rt1.runPromise(
      Effect.gen(function* () {
        const svc = yield* CodeHighlightingService;

        return yield* svc.highlight({ code: "a=1", language: "ruby", themeName: "github-dark" });
      }),
    );

    const res2 = await rt2.runPromise(
      Effect.gen(function* () {
        const svc = yield* CodeHighlightingService;

        return yield* svc.highlight({ code: "b=2", language: "ruby", themeName: "github-dark" });
      }),
    );

    expect(res1._tag).toBe("Highlighted");
    expect(res2._tag).toBe("Highlighted");

    await disposeCodeHighlightingRuntime();
  });

  test("dispose creates new runtime on next get", async () => {
    const layer = makeTestLayer();
    setCodeHighlightingLayerForTest(layer);
    const rt1 = getCodeHighlightingRuntime();
    await disposeCodeHighlightingRuntime();
    setCodeHighlightingLayerForTest(layer);
    const rt2 = getCodeHighlightingRuntime();
    expect(rt1).not.toBe(rt2);
    await disposeCodeHighlightingRuntime();
  });

  test("no per-block layer construction", async () => {
    // Prove that getCodeHighlightingRuntime does not create a new layer per call
    const layer = makeTestLayer();
    setCodeHighlightingLayerForTest(layer);
    const rts = Array.from({ length: 5 }, () => getCodeHighlightingRuntime());

    for (let i = 1; i < rts.length; i++) {
      expect(rts[i]).toBe(rts[0]);
    }

    await disposeCodeHighlightingRuntime();
  });
});
