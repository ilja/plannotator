import { describe, expect, test } from "bun:test";
import { Result } from "effect";
import { decodeSaveNotesResponse } from "./saveNotesResponse";

describe("decodeSaveNotesResponse", () => {
  test("preserves valid successful and failed note-save siblings", () => {
    const decoded = decodeSaveNotesResponse({
      results: {
        obsidian: { success: true, path: "/notes/plan.md" },
        bear: { success: false, error: "Bear is unavailable" },
        octarine: { success: true },
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        obsidian: { success: true, path: "/notes/plan.md" },
        bear: { success: false, error: "Bear is unavailable" },
        octarine: { success: true },
      });
    }
  });

  test("rejects malformed or missing save-notes response envelopes", () => {
    for (const value of [null, [], {}, { results: null }, { results: [] }]) {
      expect(Result.isFailure(decodeSaveNotesResponse(value))).toBeTrue();
    }
  });

  test("retains valid results when a target sibling is malformed", () => {
    const decoded = decodeSaveNotesResponse({
      results: {
        obsidian: { success: true, path: "/notes/plan.md" },
        bear: { success: false, error: 42 },
        octarine: { success: false, error: "Octarine is unavailable" },
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        obsidian: { success: true, path: "/notes/plan.md" },
        octarine: { success: false, error: "Octarine is unavailable" },
      });
    }
  });
});
