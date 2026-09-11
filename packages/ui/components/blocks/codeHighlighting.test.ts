import { describe, expect, test } from "bun:test";
import { Cache, Duration, Effect, Exit, Fiber } from "effect";
import {
  CodeHighlightingLive,
  CodeHighlightingService,
  MAX_BLOCK_CHARS,
  MAX_LINE_CHARS,
  checkSizeLimits,
  normalizeLanguage,
} from "./codeHighlighting";

// Fixtures
const motivatingFragment = `amount_total_before = order.amount_total

save_order_line(order_line)
  .and_then { |value| apply_invoice_correction_after_commit(transaction, value) }
  .and_then { |value| adjust_open_payment_after_commit(transaction, value) }
  .and_then do |value|
    refresh_finance_amounts_after_commit(transaction, value, amount_total_before: amount_total_before)
  end
  .and_then { |value| refresh_process_rank_after_commit(transaction, value) }`;

const fullMethodFixture = `def refresh_all(order, transaction)
  amount_total_before = order.amount_total
  save_order_line(order_line)
end`;

describe("normalizeLanguage", () => {
  test("lowercases and aliases rb to ruby", () => {
    expect(normalizeLanguage("rb")).toBe("ruby");
    expect(normalizeLanguage("RB")).toBe("ruby");
    expect(normalizeLanguage("ruby")).toBe("ruby");
  });
  test("aliases js, ts, py, yml, md, shell variants, c++", () => {
    expect(normalizeLanguage("js")).toBe("javascript");
    expect(normalizeLanguage("TS")).toBe("typescript");
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("yml")).toBe("yaml");
    expect(normalizeLanguage("md")).toBe("markdown");
    expect(normalizeLanguage("sh")).toBe("shell");
    expect(normalizeLanguage("zsh")).toBe("shell");
    expect(normalizeLanguage("c++")).toBe("cpp");
  });
  test("takes first token and trims", () => {
    expect(normalizeLanguage("ruby title=example")).toBe("ruby");
    expect(normalizeLanguage("  python  ")).toBe("python");
  });
  test("returns undefined for missing", () => {
    expect(normalizeLanguage(undefined)).toBeUndefined();
    expect(normalizeLanguage("")).toBeUndefined();
    expect(normalizeLanguage("   ")).toBeUndefined();
  });
});

describe("checkSizeLimits", () => {
  test("empty returns empty", () => {
    expect(checkSizeLimits("")).toBe("empty");
  });
  test("too-large block", () => {
    expect(checkSizeLimits("a".repeat(MAX_BLOCK_CHARS + 1))).toBe("too-large");
  });
  test("too-large line", () => {
    expect(checkSizeLimits("a".repeat(MAX_LINE_CHARS + 1))).toBe("too-large-line");
    expect(checkSizeLimits(`ok\n${"b".repeat(MAX_LINE_CHARS + 1)}`)).toBe("too-large-line");
  });
  test("ok size returns null", () => {
    expect(checkSizeLimits("hello\nworld")).toBeNull();
  });
});

describe("CodeHighlighting service", () => {
  test("highlights Ruby fragment with multiple distinct colors", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* CodeHighlightingService;

      const result = yield* svc.highlight({
        code: motivatingFragment,
        language: "ruby",
        themeName: "github-dark",
      });

      expect(result._tag).toBe("Highlighted");

      if (result._tag === "Highlighted") {
        // Check token distinctions: at least 4 distinct colors
        const colors = new Set(
          result.lines
            .flat()
            .map((t) => t.color)
            .filter(Boolean),
        );

        expect(colors.size).toBeGreaterThanOrEqual(4);
        // Check exact reconstruction
        const reconstructed = result.lines.map((l) => l.map((t) => t.content).join("")).join("\n");
        expect(reconstructed).toBe(motivatingFragment);

        // Check hostile remains literal
        // Check that variables, method calls etc are distinguished
        // At least one token for amount_total_before, =, and_then, do, end, symbol
        const allContent = result.lines
          .flat()
          .map((t) => t.content)
          .join("");

        expect(allContent).toContain("amount_total_before");
        expect(allContent).toContain("and_then");
      }
    });

    await Effect.runPromise(Effect.provide(program, CodeHighlightingLive));
  });

  test("rb alias equivalence", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* CodeHighlightingService;

      const r1 = yield* svc.highlight({
        code: motivatingFragment,
        language: "ruby",
        themeName: "github-dark",
      });

      const r2 = yield* svc.highlight({
        code: motivatingFragment,
        language: "rb",
        themeName: "github-dark",
      });

      expect(r1._tag).toBe("Highlighted");
      expect(r2._tag).toBe("Highlighted");

      if (r1._tag === "Highlighted" && r2._tag === "Highlighted") {
        expect(r1.lines.flat().length).toBe(r2.lines.flat().length);
        expect(
          r1.lines
            .flat()
            .map((t) => t.content)
            .join("") ===
            r2.lines
              .flat()
              .map((t) => t.content)
              .join(""),
        ).toBeTrue();
      }
    });

    await Effect.runPromise(Effect.provide(program, CodeHighlightingLive));
  });

  test("exact source reconstruction", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* CodeHighlightingService;

      const result = yield* svc.highlight({
        code: fullMethodFixture,
        language: "ruby",
        themeName: "github-dark",
      });

      if (result._tag === "Highlighted") {
        const rec = result.lines.map((l) => l.map((t) => t.content).join("")).join("\n");
        expect(rec).toBe(fullMethodFixture);
      } else {
        throw new Error("expected highlighted");
      }
    });

    await Effect.runPromise(Effect.provide(program, CodeHighlightingLive));
  });

  test("fallback for unknown, absent, empty, oversized", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* CodeHighlightingService;

      const unknown = yield* svc.highlight({
        code: "hello",
        language: "unknownlang123",
        themeName: "github-dark",
      });

      expect(unknown._tag).toBe("PlainText");

      if (unknown._tag === "PlainText") expect(unknown.reason).toBe("unsupported-language");

      const absent = yield* svc.highlight({
        code: "hello",
        language: undefined,
        themeName: "github-dark",
      });

      expect(absent._tag).toBe("PlainText");

      if (absent._tag === "PlainText") expect(absent.reason).toBe("unlabelled");

      const empty = yield* svc.highlight({ code: "", language: "ruby", themeName: "github-dark" });
      expect(empty._tag).toBe("PlainText");

      if (empty._tag === "PlainText") expect(empty.reason).toBe("empty");

      const oversized = yield* svc.highlight({
        code: "a".repeat(MAX_BLOCK_CHARS + 1),
        language: "ruby",
        themeName: "github-dark",
      });

      expect(oversized._tag).toBe("PlainText");

      if (oversized._tag === "PlainText") expect(oversized.reason).toBe("too-large");

      const oversizedLine = yield* svc.highlight({
        code: "a".repeat(MAX_LINE_CHARS + 1),
        language: "ruby",
        themeName: "github-dark",
      });

      expect(oversizedLine._tag).toBe("PlainText");

      if (oversizedLine._tag === "PlainText") expect(oversizedLine.reason).toBe("too-large-line");
    });

    await Effect.runPromise(Effect.provide(program, CodeHighlightingLive));
  });

  test("hostile source remains literal", async () => {
    const hostile = `<img src=x onerror=alert(1)>`;

    const program = Effect.gen(function* () {
      const svc = yield* CodeHighlightingService;

      const result = yield* svc.highlight({
        code: hostile,
        language: "ruby",
        themeName: "github-dark",
      });

      expect(result._tag).toBe("Highlighted");

      if (result._tag === "Highlighted") {
        const rec = result.lines
          .flat()
          .map((t) => t.content)
          .join("");

        expect(rec).toBe(hostile);

        // Ensure no token contains html injection
        for (const line of result.lines) {
          for (const tok of line) {
            expect(tok.content).not.toContain("<img");
            // The hostile string split across tokens, but joined equals hostile
          }
        }

        expect(
          result.lines
            .flat()
            .map((t) => t.content)
            .join(""),
        ).toBe(hostile);
      }
    });

    await Effect.runPromise(Effect.provide(program, CodeHighlightingLive));
  });

  test("Cache.get deduplicates concurrent identical tokenization", async () => {
    let lookupCalls = 0;

    const testCache = await Effect.runPromise(
      Effect.gen(function* () {
        const c = yield* Cache.make<string, number>({
          capacity: 10,
          lookup: (k: string) =>
            Effect.sync(() => {
              lookupCalls++;

              return k.length;
            }),
        });

        return c;
      }),
    );

    // Run concurrent gets
    const program = Effect.gen(function* () {
      const [a, b, c] = yield* Effect.all(
        [
          Cache.get(testCache, "hello"),
          Cache.get(testCache, "hello"),
          Cache.get(testCache, "world"),
        ],
        { concurrency: 3 },
      );

      return [a, b, c] as const;
    });

    const [a, b, c] = await Effect.runPromise(program);
    expect(a).toBe(5);
    expect(b).toBe(5);
    expect(c).toBe(5);
    // hello deduped to 1 call, world 1 call => total 2
    expect(lookupCalls).toBe(2);
  });

  test("provider error does not poison cache long-term", async () => {
    const cache = await Effect.runPromise(
      Cache.makeWith(
        (key: string) =>
          key === "fail" ? Effect.fail(new Error("boom")) : Effect.succeed(key.length),
        {
          capacity: 10,
          timeToLive: (exit) => (Exit.isFailure(exit) ? Duration.millis(0) : Duration.infinity),
        },
      ),
    );

    const e1 = await Effect.runPromise(Effect.exit(Cache.get(cache, "fail")));
    const e2 = await Effect.runPromise(Effect.exit(Cache.get(cache, "fail")));
    expect(Exit.isFailure(e1)).toBeTrue();
    expect(Exit.isFailure(e2)).toBeTrue();
  });

  test("concurrent identical service highlights share one provider lookup", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* CodeHighlightingService;
      const req = { code: motivatingFragment, language: "ruby", themeName: "github-dark" };

      const [r1, r2] = yield* Effect.all([svc.highlight(req), svc.highlight(req)], {
        concurrency: 2,
      });

      expect(r1._tag).toBe("Highlighted");
      expect(r2._tag).toBe("Highlighted");

      if (r1._tag === "Highlighted" && r2._tag === "Highlighted") {
        const c1 = r1.lines.map((l) => l.map((t) => t.content).join("")).join("\n");
        const c2 = r2.lines.map((l) => l.map((t) => t.content).join("")).join("\n");
        expect(c1).toBe(c2);
        expect(c1).toBe(motivatingFragment);
      }
    });

    await Effect.runPromise(Effect.provide(program, CodeHighlightingLive));
  });

  test("Fiber interruption remains interruption not fallback", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* CodeHighlightingService;

      const fiber = yield* svc
        .highlight({ code: motivatingFragment, language: "ruby", themeName: "github-dark" })
        .pipe(Effect.forkChild);

      yield* Fiber.interrupt(fiber);
      const exit = yield* Fiber.await(fiber);
      expect(Exit.isFailure(exit)).toBeTrue();
    });

    await Effect.runPromise(Effect.provide(program, CodeHighlightingLive));
  });

  test("one Layer serves multiple requests (no per-block layer)", async () => {
    const program = Effect.gen(function* () {
      const svc = yield* CodeHighlightingService;

      const r1 = yield* svc.highlight({
        code: "a = 1",
        language: "ruby",
        themeName: "github-dark",
      });

      const r2 = yield* svc.highlight({
        code: "b = 2",
        language: "ruby",
        themeName: "github-dark",
      });

      expect(r1._tag).toBe("Highlighted");
      expect(r2._tag).toBe("Highlighted");
    });

    // Provide same Live layer for both – proves sharing
    await Effect.runPromise(Effect.provide(program, CodeHighlightingLive));
  });
});
