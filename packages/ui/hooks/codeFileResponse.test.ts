import { describe, expect, test } from "bun:test";

import { decodeCodeFileErrorResponse, decodeCodeFileSuccessResponse } from "./codeFileResponse";

describe("decodeCodeFileSuccessResponse", () => {
  test("decodes required and valid optional fields", () => {
    expect(
      decodeCodeFileSuccessResponse({
        codeFile: true,
        contents: "const answer = 42;\n",
        filepath: "/repo/example.ts",
        prerenderedHTML: "<pre>const answer = 42;</pre>",
        line: 3,
        lineEnd: 5,
      }),
    ).toEqual({
      codeFile: true,
      contents: "const answer = 42;\n",
      filepath: "/repo/example.ts",
      prerenderedHTML: "<pre>const answer = 42;</pre>",
      line: 3,
      lineEnd: 5,
    });
  });

  test("retains valid required fields when optional siblings are malformed", () => {
    expect(
      decodeCodeFileSuccessResponse({
        contents: "valid",
        filepath: "example.ts",
        codeFile: "true",
        prerenderedHTML: 42,
        line: "3",
        lineEnd: null,
      }),
    ).toEqual({ contents: "valid", filepath: "example.ts" });
  });

  test("rejects missing or malformed required fields", () => {
    expect(decodeCodeFileSuccessResponse({ filepath: "example.ts" })).toBeUndefined();
    expect(decodeCodeFileSuccessResponse({ contents: "valid", filepath: 42 })).toBeUndefined();
    expect(decodeCodeFileSuccessResponse(null)).toBeUndefined();
  });
});

describe("decodeCodeFileErrorResponse", () => {
  test("extracts only a string error", () => {
    expect(decodeCodeFileErrorResponse({ error: "File not found" })).toBe("File not found");
    expect(decodeCodeFileErrorResponse({ error: 404 })).toBeUndefined();
    expect(decodeCodeFileErrorResponse({})).toBeUndefined();
    expect(decodeCodeFileErrorResponse(null)).toBeUndefined();
  });
});
