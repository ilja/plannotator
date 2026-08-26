import { afterEach, describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { ConfigPatch, type PlannotatorConfig } from "./config";

const TEST_HOME = join(tmpdir(), `config-test-${Date.now()}`);
const CONFIG_DIR = join(TEST_HOME, ".plannotator");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const PROJECT_ROOT = join(import.meta.dir, "../..");

interface ConfigPropertyInspection {
  prototypeIsObject: boolean;
  ownsProto: boolean;
  ownsKnownField: boolean;
  inheritsKnownField: boolean;
}

interface LoadedConfigInspection {
  config: PlannotatorConfig;
  root: ConfigPropertyInspection;
  diffOptions: ConfigPropertyInspection;
  annotationOptions: ConfigPropertyInspection;
  prompts: ConfigPropertyInspection;
  review: ConfigPropertyInspection;
  runtimes: ConfigPropertyInspection;
  runtimeOverrides: ConfigPropertyInspection;
  metadata: ConfigPropertyInspection;
}

async function loadConfigFromDisk(config: string): Promise<string> {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, config);

  const proc = Bun.spawn(
    [
      "bun",
      "-e",
      `
		import { loadConfig } from "./packages/shared/config";
		console.log(JSON.stringify(loadConfig()));
	`,
    ],
    {
      env: { ...process.env, HOME: TEST_HOME },
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Config loader subprocess failed: ${stderr}`);
  }

  return stdout;
}

async function inspectConfigFromDisk(config: string): Promise<LoadedConfigInspection> {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, config);

  const proc = Bun.spawn(
    [
      "bun",
      "-e",
      `
		import { loadConfig } from "./packages/shared/config";
		const config = loadConfig();
		const inspect = (value, knownField) => ({
			prototypeIsObject: Object.getPrototypeOf(value) === Object.prototype,
			ownsProto: Object.hasOwn(value, "__proto__"),
			ownsKnownField: Object.hasOwn(value, knownField),
			inheritsKnownField: knownField in value && !Object.hasOwn(value, knownField),
		});
		console.log(JSON.stringify({
			config,
			root: inspect(config, "displayName"),
			diffOptions: inspect(config.diffOptions, "showLineNumbers"),
			annotationOptions: inspect(config.annotationOptions, "proseFontSize"),
			prompts: inspect(config.prompts, "plan"),
			review: inspect(config.prompts?.review, "approved"),
			runtimes: inspect(config.prompts?.review?.runtimes, "unknownRuntime"),
			runtimeOverrides: inspect(config.prompts?.review?.runtimes?.pi, "denied"),
			metadata: inspect(config.prompts?.review?.runtimes?.pi?.metadata, "approved"),
		}));
	`,
    ],
    {
      env: { ...process.env, HOME: TEST_HOME },
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Config inspection subprocess failed: ${stderr}`);
  }

  const result: LoadedConfigInspection = JSON.parse(stdout);
  return result;
}

async function saveAndLoadConfig(config: string): Promise<string> {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, config);

  const proc = Bun.spawn(
    [
      "bun",
      "-e",
      `
		import { loadConfig, saveConfig } from "./packages/shared/config";
		saveConfig({ displayName: "Updated" });
		console.log(JSON.stringify(loadConfig()));
	`,
    ],
    {
      env: { ...process.env, HOME: TEST_HOME },
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
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
    const config = JSON.parse(
      await loadConfigFromDisk(
        JSON.stringify({
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
        }),
      ),
    );

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
    const config = JSON.parse(
      await loadConfigFromDisk(
        JSON.stringify({
          displayName: 1,
          conventionalComments: false,
          diffOptions: {},
          annotationOptions: {},
          conventionalLabels: [],
          prompts: { review: {} },
        }),
      ),
    );

    expect(config).toEqual({
      conventionalComments: false,
      diffOptions: {},
      annotationOptions: {},
      conventionalLabels: [],
      prompts: { review: {} },
    });
  });

  test("decodes conventional labels and prompts item by item", async () => {
    const config = JSON.parse(
      await loadConfigFromDisk(
        JSON.stringify({
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
        }),
      ),
    );

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
    const config = JSON.parse(
      await saveAndLoadConfig(
        JSON.stringify({
          diffOptions: { defaultDiffType: "branch", futureDiffOption: "retained" },
          futureTopLevelOption: { enabled: true },
        }),
      ),
    );

    expect(config).toEqual({
      displayName: "Updated",
      diffOptions: { defaultDiffType: "merge-base", futureDiffOption: "retained" },
      futureTopLevelOption: { enabled: true },
    });
  });

  test("preserves __proto__ as own JSON data without inheriting known config fields", async () => {
    const config = `{
			"__proto__": { "displayName": "inherited root" },
			"diffOptions": {
				"__proto__": { "showLineNumbers": true },
				"futureDiffOption": "retained"
			},
			"annotationOptions": {
				"__proto__": { "proseFontSize": "inherited" },
				"futureAnnotationOption": "retained"
			},
			"prompts": {
				"__proto__": { "plan": { "approved": "inherited prompts" } },
				"review": {
					"__proto__": { "approved": "inherited" },
					"runtimes": {
						"__proto__": { "unknownRuntime": { "approved": "inherited runtime" } },
						"pi": {
							"__proto__": { "denied": "inherited override" },
							"metadata": {
								"__proto__": { "approved": "inherited metadata" },
								"nested": { "enabled": true },
								"tags": ["one"]
							},
							"approved": "accepted",
							"denied": 1
						}
					}
				}
			}
		}`;
    const result = await inspectConfigFromDisk(config);

    const loadedExpected = JSON.parse(config);
    delete loadedExpected.prompts.review.runtimes.pi.denied;
    expect(result.config).toEqual(loadedExpected);

    for (const inspection of [
      result.root,
      result.diffOptions,
      result.annotationOptions,
      result.prompts,
      result.review,
      result.runtimes,
      result.runtimeOverrides,
      result.metadata,
    ]) {
      expect(inspection).toEqual({
        prototypeIsObject: true,
        ownsProto: true,
        ownsKnownField: false,
        inheritsKnownField: false,
      });
    }

    const saved = JSON.parse(await saveAndLoadConfig(config));
    const expected = JSON.parse(config);
    expected.displayName = "Updated";
    delete expected.prompts.review.runtimes.pi.denied;
    expect(saved).toEqual(expected);
  });
});
