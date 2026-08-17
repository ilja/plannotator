import { describe, expect, test } from "bun:test";

import { parseRequestBody } from "./helpers";

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
