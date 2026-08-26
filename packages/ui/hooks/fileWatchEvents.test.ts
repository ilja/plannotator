import { describe, expect, test } from "bun:test";
import { decodeFileWatchEvent } from "./fileWatchEvents";

describe("decodeFileWatchEvent", () => {
  test("decodes ready and changed events", () => {
    expect(decodeFileWatchEvent({ type: "ready", dirPath: "/tmp/notes" })).toEqual({
      type: "ready",
      dirPath: "/tmp/notes",
    });
    expect(decodeFileWatchEvent({ type: "changed", dirPath: "/tmp/notes" })).toEqual({
      type: "changed",
      dirPath: "/tmp/notes",
    });
  });

  test("normalizes missing or malformed directory paths for fan-out", () => {
    expect(decodeFileWatchEvent({ type: "ready" })).toEqual({ type: "ready", dirPath: null });
    expect(decodeFileWatchEvent({ type: "changed", dirPath: 42 })).toEqual({
      type: "changed",
      dirPath: null,
    });
  });

  test("rejects unknown types and non-object payloads", () => {
    expect(decodeFileWatchEvent({ type: "deleted", dirPath: "/tmp/notes" })).toBeNull();
    expect(decodeFileWatchEvent("changed")).toBeNull();
  });
});
