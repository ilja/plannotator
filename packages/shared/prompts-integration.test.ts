/**
 * Integration tests for the retained prompt pipeline.
 *
 * Each test writes a real ~/.plannotator/config.json (in a temp HOME),
 * then calls prompt functions WITHOUT passing a config parameter.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const TEST_HOME = join(tmpdir(), `prompts-integration-test-${Date.now()}`);
const CONFIG_DIR = join(TEST_HOME, ".plannotator");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const PROJECT_ROOT = join(import.meta.dir, "../..");

function writeConfig(config: Record<string, unknown>) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function cleanTestHome() {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
}

async function runScript(script: string): Promise<string> {
  const proc = Bun.spawn(["bun", "-e", script], {
    env: { ...process.env, HOME: TEST_HOME },
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Subprocess failed (exit ${exitCode}): ${stderr}`);
  }

  return stdout.trim();
}

describe("prompts integration (config from disk)", () => {
  beforeEach(() => {
    cleanTestHome();
    mkdirSync(CONFIG_DIR, { recursive: true });
  });
  afterEach(cleanTestHome);

  test("review approval reads override from config.json", async () => {
    writeConfig({
      prompts: {
        review: {
          approved: "Review OK.",
        },
      },
    });

    const result = await runScript(`
      import { getReviewApprovedPrompt } from "./packages/shared/prompts";
      console.log(getReviewApprovedPrompt("pi"));
    `);

    expect(result).toBe("Review OK.");
  });

  test("review denied suffix reads override from config.json", async () => {
    writeConfig({
      prompts: { review: { denied: "\n\nFix everything now." } },
    });

    const result = await runScript(`
      import { getReviewDeniedSuffix } from "./packages/shared/prompts";
      console.log(JSON.stringify(getReviewDeniedSuffix("pi")));
    `);

    expect(JSON.parse(result)).toBe("\n\nFix everything now.");
  });

  test("annotate file feedback reads override from config.json", async () => {
    writeConfig({
      prompts: {
        annotate: {
          fileFeedback: "# Notes\n\n{{filePath}}: {{feedback}}",
        },
      },
    });

    const result = await runScript(`
      import { getAnnotateFileFeedbackPrompt } from "./packages/shared/prompts";
      console.log(getAnnotateFileFeedbackPrompt("pi", undefined, {
        fileHeader: "File",
        filePath: "src/app.ts",
        feedback: "Fix line 10",
      }));
    `);

    expect(result).toBe("# Notes\n\nsrc/app.ts: Fix line 10");
  });

  test("annotate file feedback reads runtime-specific override", async () => {
    writeConfig({
      prompts: {
        annotate: {
          fileFeedback: "Generic: {{feedback}}",
          runtimes: {
            pi: { fileFeedback: "Pi: {{filePath}} — {{feedback}}" },
          },
        },
      },
    });

    const pi = await runScript(`
      import { getAnnotateFileFeedbackPrompt } from "./packages/shared/prompts";
      console.log(getAnnotateFileFeedbackPrompt("pi", undefined, {
        fileHeader: "File", filePath: "x.ts", feedback: "fix",
      }));
    `);
    expect(pi).toBe("Pi: x.ts — fix");

    const opencode = await runScript(`
      import { getAnnotateFileFeedbackPrompt } from "./packages/shared/prompts";
      console.log(getAnnotateFileFeedbackPrompt("opencode", undefined, {
        fileHeader: "File", filePath: "x.ts", feedback: "fix",
      }));
    `);
    expect(opencode).toBe("Generic: fix");
  });

  test("annotate message feedback reads override from config.json", async () => {
    writeConfig({
      prompts: {
        annotate: {
          messageFeedback: "Message review:\n\n{{feedback}}",
        },
      },
    });

    const result = await runScript(`
      import { getAnnotateMessageFeedbackPrompt } from "./packages/shared/prompts";
      console.log(getAnnotateMessageFeedbackPrompt("pi", undefined, {
        feedback: "Wrong output",
      }));
    `);

    expect(result).toBe("Message review:\n\nWrong output");
  });

  test("annotate approved reads override from config.json", async () => {
    writeConfig({
      prompts: { annotate: { approved: "LGTM" } },
    });

    const result = await runScript(`
      import { getAnnotateApprovedPrompt } from "./packages/shared/prompts";
      console.log(getAnnotateApprovedPrompt("pi"));
    `);

    expect(result).toBe("LGTM");
  });

  // ── Config merge semantics ──────────────────────────────────────────

  test("saveConfig merges annotationOptions without dropping other config", async () => {
    writeConfig({
      diffOptions: { fontSize: "13px" },
      annotationOptions: { codeFontFamily: "Fira Code" },
      prompts: { annotate: { approved: "OK" } },
    });

    const result = await runScript(`
      import { saveConfig, loadConfig } from "./packages/shared/config";
      saveConfig({ annotationOptions: { codeFontSize: "16px" } });
      console.log(JSON.stringify(loadConfig()));
    `);

    expect(JSON.parse(result)).toMatchObject({
      diffOptions: { fontSize: "13px" },
      annotationOptions: { codeFontFamily: "Fira Code", codeFontSize: "16px" },
      prompts: { annotate: { approved: "OK" } },
    });
  });

  // ── Cross-section isolation ──────────────────────────────────────────

  test("config sections do not bleed into each other", async () => {
    writeConfig({
      prompts: {
        review: { approved: "Review approved" },
        annotate: { approved: "Annotation approved" },
      },
    });

    const reviewApproved = await runScript(`
      import { getReviewApprovedPrompt } from "./packages/shared/prompts";
      console.log(getReviewApprovedPrompt("pi"));
    `);
    expect(reviewApproved).toBe("Review approved");

    const annotateApproved = await runScript(`
      import { getAnnotateApprovedPrompt } from "./packages/shared/prompts";
      console.log(getAnnotateApprovedPrompt("pi"));
    `);
    expect(annotateApproved).toBe("Annotation approved");
  });

  test("malformed config.json falls back to defaults gracefully", async () => {
    writeFileSync(CONFIG_PATH, "not valid json {{{");

    const result = await runScript(`
      import { getReviewApprovedPrompt } from "./packages/shared/prompts";
      console.log(getReviewApprovedPrompt("pi"));
    `);

    expect(result).toContain("Code review completed");
  });
});
