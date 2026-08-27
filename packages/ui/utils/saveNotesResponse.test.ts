import { describe, expect, test } from "bun:test";
import { Result } from "effect";
import { decodeSaveNotesResponse } from "./saveNotesResponse";

describe("decodeSaveNotesResponse", () => {
  test("preserves a valid Obsidian save result", () => {
    const decoded = decodeSaveNotesResponse({
      results: {
        obsidian: { success: true, path: "/notes/plan.md" },
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        obsidian: { success: true, path: "/notes/plan.md" },
      });
    }
  });

  test("rejects malformed or missing save-notes response envelopes", () => {
    for (const value of [null, [], {}, { results: null }, { results: [] }]) {
      expect(Result.isFailure(decodeSaveNotesResponse(value))).toBeTrue();
    }
  });

  test("omits malformed Obsidian results", () => {
    const decoded = decodeSaveNotesResponse({
      results: {
        obsidian: { success: false, error: 42 },
      },
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({});
    }
  });
});
