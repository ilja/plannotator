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

	test("decodes annotationOptions", () => {
		const patch = Option.getOrUndefined(
			Schema.decodeUnknownOption(ConfigPatch)({
				annotationOptions: {
					proseFontFamily: "Inter",
					proseFontSize: "14px",
					codeFontFamily: "Geist Mono",
					codeFontSize: "12px",
				},
			}),
		);

		expect(patch).toEqual({
			annotationOptions: {
				proseFontFamily: "Inter",
				proseFontSize: "14px",
				codeFontFamily: "Geist Mono",
				codeFontSize: "12px",
			},
		});
	});

	test("decodes conventionalLabels (array and null)", () => {
		const labels = Option.getOrUndefined(
			Schema.decodeUnknownOption(ConfigPatch)({
				conventionalLabels: [{ label: "nit", display: "Nit", blocking: false }],
			}),
		);
		expect(labels).toEqual({
			conventionalLabels: [{ label: "nit", display: "Nit", blocking: false }],
		});

		const nullLabels = Option.getOrUndefined(
			Schema.decodeUnknownOption(ConfigPatch)({ conventionalLabels: null }),
		);
		expect(nullLabels).toEqual({ conventionalLabels: null });
	});
});
