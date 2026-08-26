import { describe, expect, test } from "bun:test";
import { decodeAttachmentUploadResponse } from "./attachmentUploadResponse";

describe("decodeAttachmentUploadResponse", () => {
  test("ignores extra response fields", () => {
    expect(
      decodeAttachmentUploadResponse({
        path: "/uploads/image.png",
        originalName: "screenshot.png",
      }),
    ).toEqual({ path: "/uploads/image.png" });
  });

  test("accepts an empty path", () => {
    expect(decodeAttachmentUploadResponse({ path: "" })).toEqual({ path: "" });
  });

  test("rejects a missing or incorrectly typed path", () => {
    for (const value of [{}, { path: 42 }, { path: null }, { path: false }]) {
      expect(() => decodeAttachmentUploadResponse(value)).toThrow();
    }
  });

  test("rejects non-object response roots", () => {
    for (const value of [null, [], "path", 42, true]) {
      expect(() => decodeAttachmentUploadResponse(value)).toThrow();
    }
  });
});
