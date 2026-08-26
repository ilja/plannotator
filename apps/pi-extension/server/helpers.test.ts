import { describe, expect, test } from "bun:test";

import { parseRequestBody, parseStrictRequestBody } from "./helpers";

describe("parseRequestBody", () => {
  test("returns JSON objects", () => {
    expect(parseRequestBody('{"filePath":"src/app.ts"}')).toEqual({ filePath: "src/app.ts" });
  });

  test("normalizes primitive, array, and null payloads to empty objects", () => {
    expect(parseRequestBody("42")).toEqual({});
    expect(parseRequestBody("[1, 2, 3]")).toEqual({});
    expect(parseRequestBody("null")).toEqual({});
  });

  test("normalizes malformed JSON to an empty object", () => {
    expect(parseRequestBody("not-json")).toEqual({});
  });
});

describe("parseStrictRequestBody", () => {
  test("returns objects and rejects non-object or malformed payloads", () => {
    expect(parseStrictRequestBody('{"filePath":"src/app.ts"}')).toEqual({ filePath: "src/app.ts" });
    expect(parseStrictRequestBody("42")).toBeNull();
    expect(parseStrictRequestBody("[]")).toBeNull();
    expect(parseStrictRequestBody("null")).toBeNull();
    expect(parseStrictRequestBody("not-json")).toBeNull();
  });
});
