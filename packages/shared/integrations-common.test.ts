import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const TEST_HOME = join(tmpdir(), `plannotator-obsidian-vaults-${Date.now()}`);
const TEST_APP_DATA = join(TEST_HOME, "AppData", "Roaming");
const PROJECT_ROOT = join(import.meta.dir, "../..");

function obsidianConfigPath(): string {
  if (process.platform === "darwin") {
    return join(TEST_HOME, "Library/Application Support/obsidian/obsidian.json");
  }
  if (process.platform === "win32") {
    return join(TEST_APP_DATA, "obsidian/obsidian.json");
  }
  return join(TEST_HOME, ".config/obsidian/obsidian.json");
}

function writeObsidianConfig(contents: string): void {
  const configPath = obsidianConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, contents, "utf-8");
}

function cleanTestHome(): void {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
}

async function runDetectObsidianVaults(): Promise<string> {
  const proc = Bun.spawn(
    [
      "bun",
      "-e",
      `import { detectObsidianVaults } from "./packages/shared/integrations-common";
console.log(JSON.stringify(detectObsidianVaults()));`,
    ],
    {
      env: {
        ...process.env,
        HOME: TEST_HOME,
        USERPROFILE: TEST_HOME,
        APPDATA: TEST_APP_DATA,
      },
      cwd: PROJECT_ROOT,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`detectObsidianVaults subprocess failed: ${stderr}`);
  }

  return stdout;
}

afterEach(cleanTestHome);

describe("detectObsidianVaults", () => {
  test("keeps valid vault paths in config order when siblings are malformed", async () => {
    const firstVaultPath = join(TEST_HOME, "vaults", "zebra");
    const secondVaultPath = join(TEST_HOME, "vaults", "antelope");
    const missingVaultPath = join(TEST_HOME, "vaults", "missing");
    mkdirSync(firstVaultPath, { recursive: true });
    mkdirSync(secondVaultPath, { recursive: true });

    writeObsidianConfig(
      JSON.stringify({
        vaults: {
          zebra: { path: firstVaultPath },
          nullVault: null,
          stringVault: "not a vault",
          emptyPath: { path: "" },
          numberPath: { path: 1 },
          missingVault: { path: missingVaultPath },
          antelope: { path: secondVaultPath },
        },
      }),
    );

    expect(JSON.parse(await runDetectObsidianVaults())).toEqual([firstVaultPath, secondVaultPath]);
  });

  test("returns no vaults for malformed config, roots, or vault collections", async () => {
    for (const contents of [
      "not json",
      "null",
      "[]",
      "false",
      '"config"',
      "{}",
      '{"vaults":null}',
      '{"vaults":[]}',
      '{"vaults":"not a collection"}',
    ]) {
      writeObsidianConfig(contents);
      expect(JSON.parse(await runDetectObsidianVaults())).toEqual([]);
    }
  });
});
