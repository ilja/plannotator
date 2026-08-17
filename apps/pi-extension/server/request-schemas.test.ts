import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";

import {
	CodeNavRequestSchema,
	DiffTypeSchema,
	WorkspaceDiffTypeSchema,
} from "./request-schemas";

describe("review diff type schemas", () => {
	test("separates workspace diff types from local VCS diff types", () => {
		const workspaceType = "workspace-current";
		const localType = "unstaged";

		expect(
			Option.getOrUndefined(Schema.decodeUnknownOption(WorkspaceDiffTypeSchema)(workspaceType)),
		).toBe(workspaceType);
		expect(
			Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)(workspaceType)),
		).toBeUndefined();
		expect(
			Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)(localType)),
		).toBe(localType);
	});
});

describe("code navigation request schema", () => {
	test("accepts complete requests and rejects malformed fields", () => {
		const request = Option.getOrUndefined(
			Schema.decodeUnknownOption(CodeNavRequestSchema)({
				symbol: "render",
				filePath: "src/app.ts",
				line: 12,
				charStart: 4,
				side: "new",
			}),
		);
		expect(request?.symbol).toBe("render");
		expect(
			Option.getOrUndefined(
				Schema.decodeUnknownOption(CodeNavRequestSchema)({ symbol: 42 }),
			),
		).toBeUndefined();
	});
});
