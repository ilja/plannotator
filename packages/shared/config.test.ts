import { afterEach, describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { ConfigPatch } from "./config";

const TEST_HOME = join(tmpdir(), `config-test-${Date.now()}`);
const CONFIG_DIR = join(TEST_HOME, ".plannotator");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const PROJECT_ROOT = join(import.meta.dir, "../..");

async function loadConfigFromDisk(config: string): Promise<string> {
	mkdirSync(CONFIG_DIR, { recursive: true });
	writeFileSync(CONFIG_PATH, config);

	const proc = Bun.spawn(["bun", "-e", `
		import { loadConfig } from "./packages/shared/config";
		console.log(JSON.stringify(loadConfig()));
	`], {
		env: { ...process.env, HOME: TEST_HOME },
		cwd: PROJECT_ROOT,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`Config loader subprocess failed: ${stderr}`);
	}

	return stdout;
}

async function saveAndLoadConfig(config: string): Promise<string> {
	mkdirSync(CONFIG_DIR, { recursive: true });
	writeFileSync(CONFIG_PATH, config);

	const proc = Bun.spawn(["bun", "-e", `
		import { loadConfig, saveConfig } from "./packages/shared/config";
		saveConfig({ displayName: "Updated" });
		console.log(JSON.stringify(loadConfig()));
	`], {
		env: { ...process.env, HOME: TEST_HOME },
		cwd: PROJECT_ROOT,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`Config save subprocess failed: ${stderr}`);
	}

	return stdout;
}

afterEach(() => {
	if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true, force: true });
});

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

describe("loadConfig", () => {
	test("returns defaults for malformed JSON and non-object roots", async () => {
		for (const config of ["not json", "null", "[]", "false", `"config"`]) {
			expect(JSON.parse(await loadConfigFromDisk(config))).toEqual({});
		}
	});

	test("keeps valid siblings when known fields are malformed", async () => {
		const config = JSON.parse(await loadConfigFromDisk(JSON.stringify({
			displayName: "",
			conventionalComments: false,
			jina: false,
			glimpse: true,
			share: "disabled",
			pfmReminder: true,
			diffOptions: {
				fontSize: "",
				showLineNumbers: false,
				tabSize: "four",
				unknownDiffOption: "retained",
			},
			annotationOptions: {
				proseFontSize: "",
				codeFontSize: 14,
				unknownAnnotationOption: "retained",
			},
		})));

		expect(config).toEqual({
			displayName: "",
			conventionalComments: false,
			jina: false,
			glimpse: true,
			share: "disabled",
			pfmReminder: true,
			diffOptions: {
				fontSize: "",
				showLineNumbers: false,
				unknownDiffOption: "retained",
			},
			annotationOptions: {
				proseFontSize: "",
				unknownAnnotationOption: "retained",
			},
		});
	});

	test("drops malformed top-level values without dropping valid empty collections", async () => {
		const config = JSON.parse(await loadConfigFromDisk(JSON.stringify({
			displayName: 1,
			conventionalComments: false,
			diffOptions: {},
			annotationOptions: {},
			conventionalLabels: [],
			prompts: { review: {} },
		})));

		expect(config).toEqual({
			conventionalComments: false,
			diffOptions: {},
			annotationOptions: {},
			conventionalLabels: [],
			prompts: { review: {} },
		});
	});

	test("decodes conventional labels and prompts item by item", async () => {
		const config = JSON.parse(await loadConfigFromDisk(JSON.stringify({
			conventionalLabels: [
				{ label: "nit", display: "", blocking: false, color: "gray" },
				{ label: "bug", display: "Bug", blocking: "yes" },
			],
			prompts: {
				review: {
					approved: "",
					denied: 1,
					customPrompt: "retained",
					runtimes: {
						pi: { approved: "Pi approval", denied: 1 },
						unknownRuntime: { approved: "Unknown runtime", customOverride: "retained" },
						broken: "not an override record",
					},
				},
				plan: "not a section record",
			},
		})));

		expect(config).toEqual({
			conventionalLabels: [{ label: "nit", display: "", blocking: false, color: "gray" }],
			prompts: {
				review: {
					approved: "",
					customPrompt: "retained",
					runtimes: {
						pi: { approved: "Pi approval" },
						unknownRuntime: { approved: "Unknown runtime", customOverride: "retained" },
					},
				},
			},
		});
	});

	test("normalizes legacy default diff type and preserves unknown fields through save", async () => {
		const config = JSON.parse(await saveAndLoadConfig(JSON.stringify({
			diffOptions: { defaultDiffType: "branch", futureDiffOption: "retained" },
			futureTopLevelOption: { enabled: true },
		})));

		expect(config).toEqual({
			displayName: "Updated",
			diffOptions: { defaultDiffType: "merge-base", futureDiffOption: "retained" },
			futureTopLevelOption: { enabled: true },
		});
	});
});
