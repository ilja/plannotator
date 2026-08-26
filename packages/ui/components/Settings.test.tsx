import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CUSTOM_PATH_SENTINEL,
  getObsidianSettings,
  saveObsidianSettings,
  type ObsidianSettings,
} from "../utils/obsidian";
import { storage } from "../utils/storage";
import { parseCCLabels, Settings } from "./Settings";

const hasDom = globalThis.document !== undefined;
const realFetch = globalThis.fetch;
const roots: Root[] = [];
const OBSIDIAN_STORAGE_KEYS = [
  "plannotator-obsidian-enabled",
  "plannotator-obsidian-vault",
  "plannotator-obsidian-folder",
  "plannotator-obsidian-custom-path",
  "plannotator-obsidian-filename-format",
  "plannotator-obsidian-vault-browser",
  "plannotator-obsidian-autosave",
  "plannotator-obsidian-filename-separator",
];

if (hasDom) window.location.href = "http://localhost";

function installVaultFetch<Body>(body: Body): string[] {
  const calls: string[] = [];
  // SAFETY: fetch shim implements the request shape Settings uses in these browser tests.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

async function settleEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buttonWithText(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (button === undefined) throw new Error(`Settings test button not found: ${label}`);
  return button;
}

function vaultSelect(): HTMLSelectElement | undefined {
  return Array.from(document.querySelectorAll("select")).find((select) =>
    Array.from(select.options).some((option) => option.value === CUSTOM_PATH_SENTINEL),
  );
}

async function openObsidianSettings(): Promise<void> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(<Settings />);
  });

  const settingsButton = host.querySelector<HTMLButtonElement>('button[title="Settings"]');
  if (settingsButton === null) throw new Error("Settings test button not found: Settings");

  await act(async () => {
    settingsButton.click();
  });
  await settleEffects();

  await act(async () => {
    buttonWithText("Obsidian").click();
  });
  await settleEffects();
}

function enabledObsidianSettings(vaultPath: string): ObsidianSettings {
  return {
    enabled: true,
    vaultPath,
    folder: "plannotator",
    customPath: undefined,
    filenameFormat: undefined,
    filenameSeparator: "space",
    autoSave: false,
    vaultBrowserEnabled: false,
  };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }

  globalThis.fetch = realFetch;

  if (hasDom) {
    document.body.innerHTML = "";
    for (const key of OBSIDIAN_STORAGE_KEYS) storage.removeItem(key);
  }
});

describe("Settings conventional label decoding", () => {
  test("preserves defaults and explicit empty arrays", () => {
    expect(parseCCLabels(null)).toHaveLength(9);
    expect(parseCCLabels("not json")).toHaveLength(9);
    expect(parseCCLabels('{"labels":[]}')).toHaveLength(9);
    expect(parseCCLabels("[]")).toEqual([]);
  });

  test("falls back to defaults for a null array sibling", () => {
    expect(parseCCLabels(JSON.stringify([null]))).toHaveLength(9);
  });

  test("normalizes malformed entries while preserving legacy blocking values", () => {
    expect(
      parseCCLabels(
        JSON.stringify([
          { label: "issue", display: "issue", blocking: "true" },
          { label: "", display: "", blocking: false },
          { label: 42, display: null, blocking: 1 },
        ]),
      ),
    ).toEqual([
      { label: "issue", display: "issue", blocking: true },
      { label: "custom", display: "custom", blocking: false },
      { label: "custom", display: "custom", blocking: false },
    ]);
  });
});

describe("Settings Obsidian vault discovery", () => {
  test.skipIf(!hasDom)(
    "auto-selects the first decoded vault and renders every valid sibling",
    async () => {
      saveObsidianSettings(enabledObsidianSettings(""));
      const calls = installVaultFetch({
        vaults: [42, "/notes", null, "", { path: "/invalid" }, "/projects", "/notes"],
      });

      await openObsidianSettings();

      expect(calls).toEqual(["/api/obsidian/vaults"]);
      expect(getObsidianSettings().vaultPath).toBe("/notes");

      const select = vaultSelect();
      expect(select).toBeDefined();
      expect(Array.from(select?.options ?? [], (option) => option.value)).toEqual([
        "/notes",
        "",
        "/projects",
        "/notes",
        CUSTOM_PATH_SENTINEL,
      ]);
    },
  );

  test.skipIf(!hasDom)(
    "uses the existing empty-vault fallback without changing settings for a malformed envelope",
    async () => {
      const initialSettings = enabledObsidianSettings("/already-selected");
      saveObsidianSettings(initialSettings);
      const calls = installVaultFetch({ vaults: {} });

      await openObsidianSettings();

      expect(calls).toEqual(["/api/obsidian/vaults"]);
      expect(vaultSelect()).toBeUndefined();
      expect(getObsidianSettings()).toEqual(initialSettings);

      const vaultInput = Array.from(document.querySelectorAll("input")).find(
        (input) => input.placeholder === "/path/to/vault",
      );
      expect(vaultInput?.value).toBe("/already-selected");
    },
  );
});
