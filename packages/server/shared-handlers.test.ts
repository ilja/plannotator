import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Schema } from "effect";

interface StderrCapture {
  writes: string[];
  restore: () => void;
}
import {
  handleAgents,
  handleDraftLoad,
  handleDraftSave,
  handleSaveNotes,
  handleUpload,
  handleServerReady,
  isCodexDesktopHost,
  writeServerReadyMetadata,
} from "./shared-handlers";

type JsonRequestBody = Schema.Schema.Type<typeof Schema.Json>;

function saveNotesRequest(body: JsonRequestBody): Request {
  return new Request("http://localhost/api/save-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const malformedSaveNoteTargets = [
  {
    target: "obsidian",
    name: "Obsidian",
    config: { folder: "plannotator", plan: "# Test Plan" },
  },
  {
    target: "bear",
    name: "Bear",
    config: { customTags: "plannotator" },
  },
  {
    target: "octarine",
    name: "Octarine",
    config: { workspace: "workspace", folder: "plannotator" },
  },
] as const;

type StderrChunk = string | Uint8Array;

function captureStderrWrites(): StderrCapture {
  const writes: string[] = [];
  const original = process.stderr.write;
  const writeMock: typeof process.stderr.write = (chunk: StderrChunk) => {
    writes.push(String(chunk));
    return true;
  };
  process.stderr.write = writeMock;
  return {
    writes,
    restore: () => {
      process.stderr.write = original;
    },
  };
}

describe("handleUpload", () => {
  test("treats a missing file field as a bad request", async () => {
    const response = await handleUpload(new Request("http://localhost/api/upload", { method: "POST", body: new FormData() }));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("No file provided");
  });

  test("treats a string file field as a missing file", async () => {
    const formData = new FormData();
    formData.set("file", "not a file");

    const response = await handleUpload(new Request("http://localhost/api/upload", { method: "POST", body: formData }));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("No file provided");
  });
});

describe("handleAgents", () => {
  test("retains valid primary agents while filtering malformed entries", async () => {
    const response = await handleAgents({
      app: {
        agents: async () => ({
          data: [
            { name: "review", mode: "primary", description: "Review code" },
            { name: 42, mode: "primary" },
            null,
            { name: "hidden", mode: "primary", hidden: true },
            { name: "annotate", mode: "primary" },
            { name: "build", mode: "subagent" },
          ],
        }),
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      agents: [
        { id: "review", name: "review", description: "Review code" },
        { id: "annotate", name: "annotate" },
      ],
    });
  });

  test("uses the empty-agent fallback when the SDK response data is malformed", async () => {
    const response = await handleAgents({
      app: {
        agents: async () => ({ data: null }),
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ agents: [] });
  });
});

describe("handleDraftSave", () => {
  test("rejects non-object JSON without overwriting a valid draft", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "plannotator-draft-boundary-"));
    const previousDataDir = process.env.PLANNOTATOR_DATA_DIR;
    process.env.PLANNOTATOR_DATA_DIR = dataDir;

    try {
      const initial = await handleDraftSave(
        new Request("http://localhost/api/draft", {
          method: "POST",
          body: JSON.stringify({ annotations: [{ id: "initial" }] }),
        }),
        "draft-boundary",
      );
      expect(initial.status).toBe(200);

      const malformed = await handleDraftSave(
        new Request("http://localhost/api/draft", {
          method: "POST",
          body: JSON.stringify([]),
        }),
        "draft-boundary",
      );
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toEqual({ error: "Invalid draft" });
      expect(await handleDraftLoad("draft-boundary").json()).toEqual({
        annotations: [{ id: "initial" }],
      });

      const valid = await handleDraftSave(
        new Request("http://localhost/api/draft", {
          method: "POST",
          body: JSON.stringify({ annotations: [{ id: "updated" }] }),
        }),
        "draft-boundary",
      );
      expect(valid.status).toBe(200);
      expect(await handleDraftLoad("draft-boundary").json()).toEqual({
        annotations: [{ id: "updated" }],
      });
    } finally {
      if (previousDataDir === undefined) delete process.env.PLANNOTATOR_DATA_DIR;
      else process.env.PLANNOTATOR_DATA_DIR = previousDataDir;
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe("handleSaveNotes", () => {
  test("saves to an Obsidian vault and returns JSON success", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "plannotator-save-notes-"));
    try {
      const response = await handleSaveNotes(
        saveNotesRequest({
          obsidian: {
            vaultPath: tmpDir,
            folder: "plannotator",
            plan: "# Test Plan\n\nContent here",
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      const json = await response.json();
      expect(json).toHaveProperty("ok", true);
      expect(json.results.obsidian).toHaveProperty("success", true);
      expect(json.results.obsidian).toHaveProperty("path");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("returns 200 with empty results when no integrations are configured", async () => {
    const response = await handleSaveNotes(saveNotesRequest({}));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty("ok", true);
    expect(json.results).toEqual({});
  });

  test("returns a 400 JSON error for valid JSON with a non-object root", async () => {
    const response = await handleSaveNotes(saveNotesRequest("not a save-notes object"));

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Invalid JSON" });
  });

  for (const { target, name, config } of malformedSaveNoteTargets) {
    test(`reports a malformed ${name} target as an integration failure`, async () => {
      const response = await handleSaveNotes(saveNotesRequest({ [target]: config }));

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.results[target]).toEqual({
        success: false,
        error: `Invalid ${name} save configuration`,
      });
    });
  }

  test("saves a valid target when another requested target is malformed", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "plannotator-save-notes-"));
    try {
      const response = await handleSaveNotes(
        saveNotesRequest({
          obsidian: {
            vaultPath: tmpDir,
            folder: "plannotator",
            plan: "# Test Plan\n\nContent here",
          },
          bear: { customTags: "plannotator" },
        }),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.results.obsidian).toHaveProperty("success", true);
      expect(json.results.bear).toEqual({
        success: false,
        error: "Invalid Bear save configuration",
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("keeps schema-valid empty strings omitted by existing save gates", async () => {
    const response = await handleSaveNotes(
      saveNotesRequest({
        obsidian: { vaultPath: "", folder: "", plan: "" },
        bear: { plan: "" },
        octarine: { plan: "", workspace: "", folder: "" },
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.results).toEqual({});
  });

  test("a failed integration is reported, not thrown as a server error", async () => {
    const response = await handleSaveNotes(
      saveNotesRequest({
        obsidian: {
          vaultPath: "/nonexistent-vault-path",
          folder: "plannotator",
          plan: "# Test Plan\n\nContent here",
        },
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty("ok", true);
    expect(json.results.obsidian).toHaveProperty("success", false);
    expect(json.results.obsidian).toHaveProperty("error");
  });

  test("an unparseable body returns a 500 JSON error (not SPA HTML)", async () => {
    const badRequest = new Request("http://localhost/api/save-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json",
    });

    const response = await handleSaveNotes(badRequest);

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    const json = await response.json();
    expect(json).toHaveProperty("error");
  });
});

describe("writeServerReadyMetadata", () => {
  test("writes host-plugin ready metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "plannotator-ready-"));
    const readyFile = join(dir, "nested", "ready.jsonl");

    try {
      writeServerReadyMetadata(readyFile, {
        url: "http://localhost:12345",
        isRemote: false,
        port: 12345,
      });
      const [line] = readFileSync(readyFile, "utf8").trim().split(/\r?\n/);
      expect(JSON.parse(line)).toEqual({
        url: "http://localhost:12345",
        isRemote: false,
        port: 12345,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("handleServerReady", () => {
  test("detects the Codex Desktop app host", () => {
    expect(isCodexDesktopHost({ __CFBundleIdentifier: "com.openai.codex" })).toBe(true);
    expect(isCodexDesktopHost({ __CFBundleIdentifier: "com.apple.Terminal" })).toBe(false);
  });

  test("does not open a browser when host-plugin mode handles it", async () => {
    let opened = false;
    const originalBundleIdentifier = process.env.__CFBundleIdentifier;
    process.env.__CFBundleIdentifier = "com.apple.Terminal";

    try {
      await handleServerReady("http://localhost:12345", false, 12345, {
        skipBrowserOpen: true,
        openBrowser: async () => {
          opened = true;
        },
      });
    } finally {
      if (originalBundleIdentifier === undefined) {
        delete process.env.__CFBundleIdentifier;
      } else {
        process.env.__CFBundleIdentifier = originalBundleIdentifier;
      }
    }

    expect(opened).toBe(false);
  });

  // Regression: a remote session must surface a reachable URL in the terminal
  // regardless of URL sharing — otherwise a sharing-disabled remote user is left
  // with no URL and the agent hangs waiting on the review.
  test("prints the reachable URL to stderr for a remote session", async () => {
    const { writes, restore } = captureStderrWrites();
    try {
      await handleServerReady("http://localhost:19432", true, 19432, {
        skipBrowserOpen: true,
      });
    } finally {
      restore();
    }
    expect(writes.join("")).toContain("http://localhost:19432");
  });

  test("does not print the URL for a local session when the browser opens", async () => {
    const originalBundleIdentifier = process.env.__CFBundleIdentifier;
    process.env.__CFBundleIdentifier = "com.apple.Terminal";
    const { writes, restore } = captureStderrWrites();
    let opened = "";
    try {
      await handleServerReady("http://localhost:3000", false, 3000, {
        openBrowser: async (u: string) => {
          opened = u;
          return true;
        },
      });
    } finally {
      restore();
      if (originalBundleIdentifier === undefined) {
        delete process.env.__CFBundleIdentifier;
      } else {
        process.env.__CFBundleIdentifier = originalBundleIdentifier;
      }
    }
    expect(writes.join("")).not.toContain("http://localhost:3000");
    expect(opened).toBe("http://localhost:3000");
  });

  test("prints the URL for a local Codex Desktop session even when the browser opens", async () => {
    const originalBundleIdentifier = process.env.__CFBundleIdentifier;
    process.env.__CFBundleIdentifier = "com.openai.codex";
    const { writes, restore } = captureStderrWrites();
    try {
      await handleServerReady("http://localhost:3000", false, 3000, {
        openBrowser: async () => true,
      });
    } finally {
      restore();
      if (originalBundleIdentifier === undefined) {
        delete process.env.__CFBundleIdentifier;
      } else {
        process.env.__CFBundleIdentifier = originalBundleIdentifier;
      }
    }
    expect(writes.join("")).toContain("http://localhost:3000");
  });

  // Regression: a local session whose browser can't be opened (headless box,
  // devcontainer with no display) must still surface the URL, or the agent
  // hangs at waitForDecision with the user having no link to visit.
  test("prints the URL for a local session when the browser fails to open", async () => {
    const { writes, restore } = captureStderrWrites();
    try {
      await handleServerReady("http://localhost:4000", false, 4000, {
        openBrowser: async () => false,
      });
    } finally {
      restore();
    }
    expect(writes.join("")).toContain("http://localhost:4000");
  });
});
