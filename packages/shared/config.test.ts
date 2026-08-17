import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";

import { ConfigPatch } from "./config";

describe("ConfigPatch", () => {
	test("preserves every supported diff option", () => {
		const patch = Option.getOrUndefined(
			Schema.decodeUnknownOption(ConfigPatch)({
				diffOptions: {
					expandUnchanged: true,
					defaultDiffType: "merge-base",
					lineBgIntensity: "strong",
				},
			}),
		);

		expect(patch).toEqual({
			diffOptions: {
				expandUnchanged: true,
				defaultDiffType: "merge-base",
				lineBgIntensity: "strong",
			},
		});
	});
});
