import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";

import {
	hasSourceSaveConflictSnapshot,
	SourceSaveRequestSchema,
	type SourceSaveResponse,
} from "./source-save";

describe("source-save response guards", () => {
	test("recognizes conflict responses with a complete current-disk snapshot", () => {
		const response: SourceSaveResponse = {
			ok: false,
			code: "conflict",
			message: "changed",
			currentText: "disk\n",
			currentHash: "sha256:disk",
			currentMtimeMs: 1000,
			currentSize: 5,
			currentEol: "lf",
		};

		expect(hasSourceSaveConflictSnapshot(response)).toBe(true);
	});

	test("rejects conflict responses without usable snapshot metadata", () => {
		const response = {
			ok: false,
			code: "conflict",
			message: "changed",
			currentText: "disk\n",
			currentHash: "sha256:disk",
			currentMtimeMs: 1000,
			currentSize: 5,
			currentEol: "unknown",
		} as unknown as SourceSaveResponse;

		expect(hasSourceSaveConflictSnapshot(response)).toBe(false);
	});
});

describe("SourceSaveRequestSchema", () => {
	test("decodes a valid save request", () => {
		const request = Option.getOrUndefined(
			Schema.decodeUnknownOption(SourceSaveRequestSchema)({
				text: "new content",
				baseHash: "sha256:base",
				path: "src/doc.md",
				allowMissingBase: true,
			}),
		);
		expect(request).toEqual({
			text: "new content",
			baseHash: "sha256:base",
			path: "src/doc.md",
			allowMissingBase: true,
		});
	});

	test("rejects a request without text or baseHash", () => {
		const missingText = Option.getOrUndefined(
			Schema.decodeUnknownOption(SourceSaveRequestSchema)({ baseHash: "sha256:base" }),
		);
		expect(missingText).toBeUndefined();

		const missingBaseHash = Option.getOrUndefined(
			Schema.decodeUnknownOption(SourceSaveRequestSchema)({ text: "content" }),
		);
		expect(missingBaseHash).toBeUndefined();
	});

	test("rejects a non-string baseHash", () => {
		const request = Option.getOrUndefined(
			Schema.decodeUnknownOption(SourceSaveRequestSchema)({
				text: "content",
				baseHash: 12345,
			}),
		);
		expect(request).toBeUndefined();
	});
});