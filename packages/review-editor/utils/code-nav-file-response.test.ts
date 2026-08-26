import { describe, expect, test } from "bun:test";
import { decodeCodeNavFileResponse } from "./code-nav-file-response";

describe("decodeCodeNavFileResponse", () => {
  test("decodes a response with string content", () => {
    expect(decodeCodeNavFileResponse({ content: "const answer = 42;" })).toEqual({
      content: "const answer = 42;",
    });
  });

  test("rejects malformed roots and content", () => {
    for (const value of [
      null,
      [],
      "file content",
      {},
      { content: 42 },
      { content: null },
      { content: undefined },
    ]) {
      expect(decodeCodeNavFileResponse(value)).toBeUndefined();
    }
  });
});
