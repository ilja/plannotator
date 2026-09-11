import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Schema } from "effect";
import { startAnnotateServer, startReviewServer } from "./server";
import {
  getGitContext,
  getFileContentsForDiff,
  gitAddFile,
  gitResetFile,
  runGitDiff,
} from "./server/git.js";
import { createPiAIRuntime, handlePiAIRequest } from "./server/ai-runtime.js";
import { loadConfig } from "./generated/config.js";
import { WorkspaceReviewSession } from "./generated/review-workspace.js";

const tempDirs: string[] = [];

const originalCwd = process.cwd();

const originalHome = process.env.HOME;

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

const originalPort = process.env.PLANNOTATOR_PORT;

const originalSemPath = process.env.PLANNOTATOR_SEM_PATH;

const originalDataDir = process.env.PLANNOTATOR_DATA_DIR;

const pathEnvKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";

const originalPath = process.env[pathEnvKey];

type SaveNotesRequestBody = Schema.Schema.Type<typeof Schema.Json>;

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);

  return dir;
}

function childEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8", env: childEnv() });

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
}

function initRepo(): string {
  const repoDir = makeTempDir("plannotator-pi-review-");
  git(repoDir, ["init"]);
  git(repoDir, ["branch", "-M", "main"]);
  git(repoDir, ["config", "user.email", "pi-review@example.com"]);
  git(repoDir, ["config", "user.name", "Pi Review"]);

  writeFileSync(join(repoDir, "tracked.txt"), "before\n", "utf-8");
  git(repoDir, ["add", "tracked.txt"]);
  git(repoDir, ["commit", "-m", "initial"]);

  return repoDir;
}

function makeMockSem(
  dir: string,
  options: {
    runCwdLogPath?: string;
    inputLogPath?: string;
  } = {},
): string {
  const semPath = join(dir, "sem");
  writeFileSync(
    semPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [ "${1:-}" = "--version" ]; then',
      '  echo "sem 0.8.0"',
      "  exit 0",
      "fi",
      ...(options.runCwdLogPath ? [`pwd >> ${JSON.stringify(options.runCwdLogPath)}`] : []),
      ...(options.inputLogPath
        ? [`cat > ${JSON.stringify(options.inputLogPath)}`]
        : ["cat >/dev/null"]),
      "cat <<'JSON'",
      JSON.stringify({
        summary: {
          fileCount: 1,
          added: 1,
          modified: 0,
          deleted: 0,
          moved: 0,
          renamed: 0,
          reordered: 0,
          binary: 0,
          orphan: 0,
          total: 1,
        },
        changes: [
          {
            entityId: "src/app.ts::function::created",
            changeType: "added",
            entityType: "function",
            entityName: "created",
            filePath: "src/app.ts",
            startLine: 1,
            endLine: 3,
          },
        ],
        binaryChanges: [],
      }),
      "JSON",
      "",
    ].join("\n"),
    "utf-8",
  );
  chmodSync(semPath, 0o755);

  return semPath;
}

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || !("port" in address)) {
        server.close();
        reject(new Error("Failed to reserve test port"));

        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);

          return;
        }

        resolve(port);
      });
    });
  });
}

afterEach(() => {
  process.chdir(originalCwd);

  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  }

  if (originalPort === undefined) {
    delete process.env.PLANNOTATOR_PORT;
  } else {
    process.env.PLANNOTATOR_PORT = originalPort;
  }

  if (originalSemPath === undefined) {
    delete process.env.PLANNOTATOR_SEM_PATH;
  } else {
    process.env.PLANNOTATOR_SEM_PATH = originalSemPath;
  }

  if (originalDataDir === undefined) {
    delete process.env.PLANNOTATOR_DATA_DIR;
  } else {
    process.env.PLANNOTATOR_DATA_DIR = originalDataDir;
  }

  if (originalPath === undefined) {
    delete process.env[pathEnvKey];
  } else {
    process.env[pathEnvKey] = originalPath;
  }

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("pi AI runtime", () => {
  test("reports only the Pi SDK provider when pi is available", async () => {
    const tempDir = makeTempDir("plannotator-pi-ai-runtime-");
    const fakeBin = join(tempDir, "bin");
    mkdirSync(fakeBin, { recursive: true });

    const piPath = join(fakeBin, "pi");
    writeFileSync(
      piPath,
      `#!/usr/bin/env node
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  if (message.type === "get_available_models") {
    process.stdout.write(JSON.stringify({
      type: "response",
      id: message.id,
      success: true,
      data: { models: [{ provider: "fake", id: "pi-model", name: "Pi Model" }] },
    }) + "\\n");
    return;
  }
  process.stdout.write(JSON.stringify({ type: "response", id: message.id, success: true, data: {} }) + "\\n");
});
setInterval(() => {}, 1000);
`,
      "utf-8",
    );
    chmodSync(piPath, 0o755);
    process.env[pathEnvKey] = `${fakeBin}${delimiter}${originalPath ?? ""}`;

    const runtime = await createPiAIRuntime({ cwd: tempDir, getCwd: () => tempDir });
    expect(runtime).not.toBeNull();

    try {
      const response = await runtime!.endpoints["/api/ai/capabilities"](
        new Request("http://localhost/api/ai/capabilities"),
      );

      expect(response.status).toBe(200);

      const body: {
        available: boolean;
        providers: Array<{ id: string; name: string; models?: Array<{ id: string }> }>;
      } = await response.json();

      expect(body.available).toBe(true);
      expect(body.providers).toHaveLength(1);
      expect(body.providers[0]).toMatchObject({ id: "pi-sdk", name: "pi-sdk" });
      expect(body.providers.map((provider) => provider.name)).not.toContain("claude-agent-sdk");
      expect(body.providers.map((provider) => provider.name)).not.toContain("codex-sdk");
      expect(body.providers.map((provider) => provider.name)).not.toContain("opencode-sdk");
      expect(body.providers[0].models?.map((model) => model.id)).toEqual(["fake/pi-model"]);
    } finally {
      runtime?.dispose();
    }
  });
});

describe("unavailable pi AI endpoint", () => {
  test("returns a schema-compatible capabilities response", async () => {
    const server = createHttpServer((req, res) => {
      void handlePiAIRequest(req, res, new URL(req.url ?? "/", "http://localhost"), null);
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();

      if (!address || !("port" in address)) throw new Error("Failed to start test server");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/ai/capabilities`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(
        JSON.stringify({
          available: false,
          providers: [],
          defaultProvider: null,
        }),
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

describe("pi annotate server", () => {
  test("serves annotation-only payload with recent message metadata", async () => {
    const dataDir = makeTempDir("plannotator-pi-annotate-data-");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "assistant text",
      filePath: "last-message",
      htmlContent: "<html></html>",
      origin: "pi",
      mode: "annotate-last",
      recentMessages: [{ messageId: "entry-1", text: "assistant text" }],
    });

    try {
      const response = await fetch(`${server.url}/api/plan`);
      expect(response.status).toBe(200);

      const payload: {
        mode?: string;
        recentMessages?: Array<{ messageId: string; text: string }>;
      } = await response.json();

      expect(payload.mode).toBe("annotate-last");
      expect(payload.recentMessages).toEqual([{ messageId: "entry-1", text: "assistant text" }]);
    } finally {
      server.stop();
    }
  });

  test("rejects malformed drafts without overwriting a valid draft", async () => {
    const dataDir = makeTempDir("plannotator-pi-draft-boundary-");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "assistant text",
      filePath: "last-message",
      htmlContent: "<html></html>",
      origin: "pi",
      mode: "annotate-last",
      recentMessages: [{ messageId: "entry-1", text: "assistant text" }],
    });

    try {
      const initial = await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: [{ id: "initial" }] }),
      });

      expect(initial.status).toBe(200);

      const malformed = await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([]),
      });

      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toEqual({ error: "Invalid draft" });

      const loaded = await fetch(`${server.url}/api/draft`);
      expect(loaded.status).toBe(200);
      expect(await loaded.json()).toEqual({ annotations: [{ id: "initial" }] });

      const valid = await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: [{ id: "updated" }] }),
      });

      expect(valid.status).toBe(200);

      const updated = await fetch(`${server.url}/api/draft`);
      expect(await updated.json()).toEqual({ annotations: [{ id: "updated" }] });
    } finally {
      server.stop();
    }
  });

  test("resolves feedback with selected message metadata and clears drafts", async () => {
    const dataDir = makeTempDir("plannotator-pi-annotate-feedback-data-");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "assistant text",
      filePath: "last-message",
      htmlContent: "<html></html>",
      origin: "pi",
      mode: "annotate-last",
      recentMessages: [{ messageId: "entry-1", text: "assistant text" }],
    });

    try {
      const draftSave = await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: [{ id: "draft-1" }], draftGeneration: 3 }),
      });

      expect(draftSave.status).toBe(200);

      const feedbackResponse = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          feedback: "Fix this",
          annotations: [],
          selectedMessageId: "entry-1",
          feedbackScope: "message",
          draftGeneration: 3,
        }),
      });

      expect(feedbackResponse.status).toBe(200);

      await expect(server.waitForDecision()).resolves.toMatchObject({
        feedback: "Fix this",
        selectedMessageId: "entry-1",
        feedbackScope: "message",
      });

      const draftLoad = await fetch(`${server.url}/api/draft`);
      expect(draftLoad.status).toBe(404);
    } finally {
      server.stop();
    }
  });

  test("rejects malformed feedback without consuming the annotate decision", async () => {
    const dataDir = makeTempDir("plannotator-pi-annotate-feedback-boundary-");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "assistant text",
      filePath: "last-message",
      htmlContent: "<html></html>",
      origin: "pi",
      mode: "annotate-last",
    });

    const decision = server.waitForDecision();

    try {
      const malformed = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: 42 }),
      });

      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toEqual({ error: "Invalid request" });

      const valid = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: "valid feedback",
          annotations: [null, { id: "unknown" }],
          selectedMessageId: "entry-1",
          feedbackScope: "messages",
        }),
      });

      expect(valid.status).toBe(200);
      await expect(decision).resolves.toEqual({
        feedback: "valid feedback",
        annotations: [null, { id: "unknown" }],
        selectedMessageId: "entry-1",
        feedbackScope: "messages",
      });
    } finally {
      server.stop();
    }
  });

  test("validates external annotation patches without mutating malformed updates", async () => {
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: "test.md",
      htmlContent: "<html></html>",
      origin: "pi",
    });

    try {
      const create = await fetch(`${server.url}/api/external-annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "editor", text: "original" }),
      });

      const { ids } = await create.json();
      const id = ids[0];

      const invalidField = await fetch(`${server.url}/api/external-annotations?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: 7 }),
      });

      expect(invalidField.status).toBe(400);

      const unchanged = await fetch(`${server.url}/api/external-annotations`);
      expect(await unchanged.json()).toMatchObject({
        version: 1,
        annotations: [{ id, text: "original" }],
      });

      const valid = await fetch(`${server.url}/api/external-annotations?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "spoofed-id",
          text: "updated",
          futureMetadata: { preserved: true },
        }),
      });

      expect(valid.status).toBe(200);
      expect(await valid.json()).toMatchObject({
        annotation: { id, text: "updated", futureMetadata: { preserved: true } },
      });
    } finally {
      server.stop();
    }
  });

  test("resolves gate approval and clears drafts", async () => {
    const dataDir = makeTempDir("plannotator-pi-annotate-approve-data-");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "# Annotate",
      filePath: "doc.md",
      htmlContent: "<html></html>",
      origin: "pi",
      mode: "annotate",
      gate: true,
    });

    try {
      await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: [{ id: "draft-approve" }], draftGeneration: 1 }),
      });

      const approveResponse = await fetch(`${server.url}/api/approve?draftGeneration=1`, {
        method: "POST",
      });

      expect(approveResponse.status).toBe(200);

      await expect(server.waitForDecision()).resolves.toEqual({
        feedback: "",
        annotations: [],
        approved: true,
      });

      const draftLoad = await fetch(`${server.url}/api/draft`);
      expect(draftLoad.status).toBe(404);
    } finally {
      server.stop();
    }
  });

  test("resolves exit and clears drafts", async () => {
    const dataDir = makeTempDir("plannotator-pi-annotate-exit-data-");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "# Annotate",
      filePath: "doc.md",
      htmlContent: "<html></html>",
      origin: "pi",
      mode: "annotate",
    });

    try {
      await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: [{ id: "draft-exit" }], draftGeneration: 2 }),
      });

      const exitResponse = await fetch(`${server.url}/api/exit?draftGeneration=2`, {
        method: "POST",
      });

      expect(exitResponse.status).toBe(200);

      await expect(server.waitForDecision()).resolves.toEqual({
        feedback: "",
        annotations: [],
        exit: true,
      });

      const draftLoad = await fetch(`${server.url}/api/draft`);
      expect(draftLoad.status).toBe(404);
    } finally {
      server.stop();
    }
  });

  test("serves folder annotation metadata", async () => {
    const dataDir = makeTempDir("plannotator-pi-annotate-folder-data-");
    const folderPath = makeTempDir("plannotator-pi-annotate-folder-");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "",
      filePath: folderPath,
      folderPath,
      htmlContent: "<html></html>",
      origin: "pi",
      mode: "annotate-folder",
    });

    try {
      const payload: {
        mode?: string;
        projectRoot?: string;
        sourceSave?: { enabled?: boolean; reason?: string };
      } = await fetch(`${server.url}/api/plan`).then((response) => response.json());

      expect(payload.mode).toBe("annotate-folder");
      expect(payload.projectRoot).toBe(folderPath);
      expect(payload.sourceSave).toMatchObject({
        enabled: false,
        reason: "folder-mode",
      });
    } finally {
      server.stop();
    }
  });

  test("reports AI capability fallback without failing the annotate server", async () => {
    const dataDir = makeTempDir("plannotator-pi-annotate-ai-data-");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "# Annotate",
      filePath: "doc.md",
      htmlContent: "<html></html>",
      origin: "pi",
      mode: "annotate",
    });

    try {
      const response = await fetch(`${server.url}/api/ai/capabilities`);
      expect(response.status).toBe(200);
      const payload: { available?: boolean; providers?: unknown[] } = await response.json();
      expect(payload.available).toBeTypeOf("boolean");
      expect(Array.isArray(payload.providers)).toBe(true);
    } finally {
      server.stop();
    }
  });

  test("keeps save-notes request validation and Obsidian saves in parity", async () => {
    const vaultPath = makeTempDir("plannotator-pi-save-notes-");
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startAnnotateServer({
      markdown: "# Test",
      filePath: "test.md",
      htmlContent: "<html></html>",
      origin: "pi",
    });

    const saveNotes = (body: SaveNotesRequestBody) =>
      fetch(`${server.url}/api/save-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    try {
      for (const body of [[], "not a save-notes object"]) {
        const response = await saveNotes(body);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Invalid JSON" });
      }

      for (const target of ["bear", "octarine"] as const) {
        const response = await saveNotes({ [target]: {} });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "Unsupported save target" });
      }

      const malformed = await saveNotes({ obsidian: { folder: "plannotator", plan: "# Test" } });
      expect(malformed.status).toBe(200);
      expect(await malformed.json()).toEqual({
        ok: true,
        results: {
          obsidian: { success: false, error: "Invalid Obsidian save configuration" },
        },
      });

      const valid = await saveNotes({
        obsidian: { vaultPath, folder: "plannotator", plan: "# Test" },
      });

      expect(valid.status).toBe(200);

      const saved: { results: { obsidian?: { success: boolean; path?: string } } } =
        await valid.json();

      const obsidian = saved.results.obsidian;
      expect(obsidian?.success).toBe(true);

      if (!obsidian?.path) throw new Error("Expected a saved Obsidian note path");
      expect(existsSync(obsidian.path)).toBe(true);
      expect(readFileSync(obsidian.path, "utf-8")).toContain("# Test");
    } finally {
      server.stop();
    }
  });
});

describe("pi review server", () => {
  const semanticRawPatch = [
    "diff --git a/src/app.ts b/src/app.ts",
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    "+++ b/src/app.ts",
    "@@ -0,0 +1,3 @@",
    "+export function created() {",
    "+  return true;",
    "+}",
    "",
  ].join("\n");

  test("advertises semantic diff availability and runs the endpoint", async () => {
    const dir = makeTempDir("plannotator-pi-sem-server-");
    const dataDir = makeTempDir("plannotator-pi-sem-data-");
    const cwdLogPath = join(dir, "cwd-log");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_SEM_PATH = makeMockSem(dir, { runCwdLogPath: cwdLogPath });
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startReviewServer({
      rawPatch: semanticRawPatch,
      gitRef: "test",
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const diffPayload: {
        semanticDiff?: { available: boolean; semVersion?: string; semSource?: string };
      } = await fetch(`${server.url}/api/diff`).then((response) => response.json());

      expect(diffPayload.semanticDiff).toMatchObject({
        available: true,
        semVersion: "0.8.0",
        semSource: "env",
      });

      const semanticPayload: {
        status: string;
        summary?: { added: number; fileCount: number };
        changes?: Array<{ entityType: string; entityName: string; filePath: string }>;
      } = await fetch(`${server.url}/api/semantic-diff?fileExt=.ts`).then((response) =>
        response.json(),
      );

      expect(semanticPayload).toMatchObject({
        status: "ok",
        summary: { added: 1, fileCount: 1 },
        changes: [{ entityType: "function", entityName: "created", filePath: "src/app.ts" }],
      });
      expect(realpathSync(readFileSync(cwdLogPath, "utf-8").trim())).toBe(
        realpathSync(join(dataDir, "semantic-diff", "patch-only")),
      );
    } finally {
      server.stop();
    }
  });

  test("runs semantic diff from the local agent cwd when one is available", async () => {
    const dir = makeTempDir("plannotator-pi-sem-agent-");
    const agentCwd = makeTempDir("plannotator-pi-sem-agent-cwd-");
    const cwdLogPath = join(dir, "cwd-log");
    process.env.PLANNOTATOR_SEM_PATH = makeMockSem(dir, { runCwdLogPath: cwdLogPath });
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startReviewServer({
      rawPatch: semanticRawPatch,
      gitRef: "test",
      origin: "pi",
      agentCwd,
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const semanticPayload: {
        status: string;
      } = await fetch(`${server.url}/api/semantic-diff`).then((response) => response.json());

      expect(semanticPayload.status).toBe("ok");
      expect(realpathSync(readFileSync(cwdLogPath, "utf-8").trim())).toBe(realpathSync(agentCwd));
    } finally {
      server.stop();
    }
  });

  test("runs semantic diff from the local git context cwd in local review mode", async () => {
    const dir = makeTempDir("plannotator-pi-sem-local-");
    const repoDir = initRepo();
    const cwdLogPath = join(dir, "cwd-log");
    const gitContext = await getGitContext(repoDir);
    process.env.PLANNOTATOR_SEM_PATH = makeMockSem(dir, { runCwdLogPath: cwdLogPath });
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startReviewServer({
      rawPatch: semanticRawPatch,
      gitRef: "test",
      origin: "pi",
      diffType: "unstaged",
      gitContext,
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const semanticPayload: {
        status: string;
      } = await fetch(`${server.url}/api/semantic-diff`).then((response) => response.json());

      expect(semanticPayload.status).toBe("ok");
      expect(realpathSync(readFileSync(cwdLogPath, "utf-8").trim())).toBe(realpathSync(repoDir));
    } finally {
      server.stop();
    }
  });

  test("hides semantic diff from /api/diff when sem cannot be resolved", async () => {
    const dir = makeTempDir("plannotator-pi-sem-missing-server-");
    process.env.PLANNOTATOR_SEM_PATH = join(dir, "missing-sem");
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startReviewServer({
      rawPatch: semanticRawPatch,
      gitRef: "test",
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const diffPayload: {
        semanticDiff?: { available: boolean };
      } = await fetch(`${server.url}/api/diff`).then((response) => response.json());

      expect(diffPayload.semanticDiff?.available).toBe(false);

      const semanticPayload: { status: string } = await fetch(
        `${server.url}/api/semantic-diff`,
      ).then((response) => response.json());

      expect(semanticPayload.status).toBe("unavailable");
    } finally {
      server.stop();
    }
  });

  test("serves review diff parity endpoints including drafts, uploads, and editor annotations", async () => {
    const homeDir = makeTempDir("plannotator-pi-home-");
    const repoDir = initRepo();
    process.env.HOME = homeDir;
    process.chdir(repoDir);
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    writeFileSync(join(repoDir, "tracked.txt"), "after\n", "utf-8");
    writeFileSync(join(repoDir, "untracked.txt"), "brand new\n", "utf-8");

    const gitContext = await getGitContext();
    const diff = await runGitDiff("uncommitted", gitContext.defaultBranch);

    const server = await startReviewServer({
      rawPatch: diff.patch,
      gitRef: diff.label,
      error: diff.error,
      diffType: "uncommitted",
      gitContext,
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const diffResponse = await fetch(`${server.url}/api/diff`);
      expect(diffResponse.status).toBe(200);

      const diffPayload: {
        rawPatch: string;
        gitContext?: { diffOptions: Array<{ id: string }> };
        origin?: string;
        repoInfo?: { display: string };
      } = await diffResponse.json();

      expect(diffPayload.origin).toBe("pi");
      expect(diffPayload.rawPatch).toContain("diff --git a/untracked.txt b/untracked.txt");
      expect(diffPayload.gitContext?.diffOptions.map((option) => option.id)).toEqual(
        expect.arrayContaining(["uncommitted", "staged", "unstaged", "last-commit"]),
      );
      expect(diffPayload.repoInfo?.display).toBeTruthy();

      const malformedCodeNavResponse = await fetch(`${server.url}/api/code-nav/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: 42, filePath: "tracked.txt", side: "new" }),
      });

      expect(malformedCodeNavResponse.status).toBe(400);

      const fileContentResponse = await fetch(`${server.url}/api/file-content?path=tracked.txt`);

      const fileContent: {
        oldContent: string | null;
        newContent: string | null;
      } = await fileContentResponse.json();

      expect(fileContent.oldContent).toBe("before\n");
      expect(fileContent.newContent).toBe("after\n");

      const draftBody = { annotations: [{ id: "draft-1" }] };

      const draftSave = await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftBody),
      });

      expect(draftSave.status).toBe(200);

      const draftLoad = await fetch(`${server.url}/api/draft`);
      expect(draftLoad.status).toBe(200);
      expect(await draftLoad.json()).toEqual(draftBody);

      const malformedAnnotation = await fetch(`${server.url}/api/editor-annotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: 42,
          selectedText: "after",
          lineStart: 1,
          lineEnd: 1,
        }),
      });

      expect(malformedAnnotation.status).toBe(400);

      const annotationCreate = await fetch(`${server.url}/api/editor-annotation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: "tracked.txt",
          selectedText: "after",
          lineStart: 1,
          lineEnd: 1,
          comment: "Check wording",
        }),
      });

      expect(annotationCreate.status).toBe(200);
      const createdAnnotation: { id: string } = await annotationCreate.json();
      expect(createdAnnotation.id).toBeTruthy();

      const annotationsList = await fetch(`${server.url}/api/editor-annotations`);

      const annotationsPayload: { annotations: Array<{ id: string }> } =
        await annotationsList.json();

      expect(annotationsPayload.annotations).toHaveLength(1);
      expect(annotationsPayload.annotations[0].id).toBe(createdAnnotation.id);

      const annotationDelete = await fetch(
        `${server.url}/api/editor-annotation?id=${encodeURIComponent(createdAnnotation.id)}`,
        { method: "DELETE" },
      );

      expect(annotationDelete.status).toBe(200);

      const formData = new FormData();
      formData.append("file", new File(["png-bytes"], "diagram.png", { type: "image/png" }));

      const uploadResponse = await fetch(`${server.url}/api/upload`, {
        method: "POST",
        body: formData,
      });

      expect(uploadResponse.status).toBe(200);
      const uploadPayload: { path: string; originalName: string } = await uploadResponse.json();
      expect(uploadPayload.originalName).toBe("diagram.png");

      const imageResponse = await fetch(
        `${server.url}/api/image?path=${encodeURIComponent(uploadPayload.path)}`,
      );

      expect(imageResponse.status).toBe(200);
      expect(await imageResponse.text()).toBe("png-bytes");

      const draftDelete = await fetch(`${server.url}/api/draft`, { method: "DELETE" });
      expect(draftDelete.status).toBe(200);

      const draftMissing = await fetch(`${server.url}/api/draft`);
      expect(draftMissing.status).toBe(404);

      const generatedDraft = { codeAnnotations: [{ id: "stale-draft" }], draftGeneration: 5 };

      const generatedDraftSave = await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generatedDraft),
      });

      expect(generatedDraftSave.status).toBe(200);

      const invalidReviewFeedback = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: {} }),
      });

      expect(invalidReviewFeedback.status).toBe(400);

      const feedbackResponse = await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftGeneration: 5,
          approved: false,
          feedback: "Please update the diff",
          annotations: [{ id: "note-1" }],
        }),
      });

      expect(feedbackResponse.status).toBe(200);

      const lateDraftSave = await fetch(`${server.url}/api/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generatedDraft),
      });

      expect(lateDraftSave.status).toBe(200);
      const lateDraftLoad = await fetch(`${server.url}/api/draft`);
      expect(lateDraftLoad.status).toBe(404);
      expect(await lateDraftLoad.json()).toEqual({ found: false, draftGeneration: 5 });

      await expect(server.waitForDecision()).resolves.toEqual({
        approved: false,
        feedback: "Please update the diff",
        annotations: [{ id: "note-1" }],
      });
    } finally {
      server.stop();
    }
  });

  test("exit endpoint resolves decision with exit flag", async () => {
    const homeDir = makeTempDir("plannotator-pi-home-");
    const repoDir = initRepo();
    process.env.HOME = homeDir;
    process.chdir(repoDir);
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const gitContext = await getGitContext();
    const diff = await runGitDiff("uncommitted", gitContext.defaultBranch);

    const server = await startReviewServer({
      rawPatch: diff.patch,
      gitRef: diff.label,
      error: diff.error,
      diffType: "uncommitted",
      gitContext,
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const exitResponse = await fetch(`${server.url}/api/exit`, { method: "POST" });
      expect(exitResponse.status).toBe(200);
      expect(await exitResponse.json()).toEqual({ ok: true });

      await expect(server.waitForDecision()).resolves.toEqual({
        exit: true,
        approved: false,
        feedback: "",
        annotations: [],
      });
    } finally {
      server.stop();
    }
  });

  test("git-add endpoint stages and unstages files in review mode", async () => {
    const homeDir = makeTempDir("plannotator-pi-home-");
    const repoDir = initRepo();
    process.env.HOME = homeDir;
    process.chdir(repoDir);
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    writeFileSync(join(repoDir, "stage-me.txt"), "new file\n", "utf-8");

    const gitContext = await getGitContext();
    const diff = await runGitDiff("uncommitted", gitContext.defaultBranch);

    const server = await startReviewServer({
      rawPatch: diff.patch,
      gitRef: diff.label,
      error: diff.error,
      diffType: "uncommitted",
      gitContext,
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const stageResponse = await fetch(`${server.url}/api/git-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: "stage-me.txt" }),
      });

      expect(stageResponse.status).toBe(200);
      expect(git(repoDir, ["diff", "--staged", "--name-only"])).toContain("stage-me.txt");

      const invalidUndoResponse = await fetch(`${server.url}/api/git-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: "stage-me.txt", undo: "false" }),
      });

      expect(invalidUndoResponse.status).toBe(400);
      expect(git(repoDir, ["diff", "--staged", "--name-only"])).toContain("stage-me.txt");

      const unstageResponse = await fetch(`${server.url}/api/git-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: "stage-me.txt", undo: true }),
      });

      expect(unstageResponse.status).toBe(200);
      expect(git(repoDir, ["diff", "--staged", "--name-only"])).not.toContain("stage-me.txt");
      expect(git(repoDir, ["status", "--short"])).toContain("?? stage-me.txt");

      await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: true,
          feedback: "LGTM - no changes requested.",
          annotations: [],
        }),
      });
      await server.waitForDecision();
    } finally {
      server.stop();
    }
  }, 15_000);

  test("review config endpoint preserves all supported diff options", async () => {
    const dataDir = makeTempDir("plannotator-pi-config-");
    process.env.PLANNOTATOR_DATA_DIR = dataDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startReviewServer({
      rawPatch: "",
      gitRef: "test",
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const response = await fetch(`${server.url}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diffOptions: {
            expandUnchanged: true,
            defaultDiffType: "merge-base",
            lineBgIntensity: "strong",
          },
        }),
      });

      expect(response.status).toBe(200);
      expect(loadConfig().diffOptions).toMatchObject({
        expandUnchanged: true,
        defaultDiffType: "merge-base",
        lineBgIntensity: "strong",
      });
    } finally {
      server.stop();
    }
  });

  test("rejects non-object config request bodies", async () => {
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const annotateServer = await startAnnotateServer({
      markdown: "# Test",
      filePath: "test.md",
      htmlContent: "<html></html>",
      origin: "pi",
    });

    try {
      const configResponse = await fetch(`${annotateServer.url}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([]),
      });

      expect(configResponse.status).toBe(400);
      expect(await configResponse.json()).toEqual({ error: "Invalid request" });
    } finally {
      annotateServer.stop();
    }

    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const reviewServer = await startReviewServer({
      rawPatch: "",
      gitRef: "test",
      origin: "pi",
      htmlContent: "<html></html>",
    });

    try {
      const configResponse = await fetch(`${reviewServer.url}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([]),
      });

      expect(configResponse.status).toBe(400);
      expect(await configResponse.json()).toEqual({ error: "Invalid request" });
    } finally {
      reviewServer.stop();
    }
  });

  test("rejects malformed GitHub viewed-file requests before mutation", async () => {
    const ghDir = makeTempDir("plannotator-pi-gh-");
    const ghPath = join(ghDir, "gh");
    writeFileSync(ghPath, "#!/bin/sh\nexit 1\n", "utf-8");
    chmodSync(ghPath, 0o755);
    process.env[pathEnvKey] = `${ghDir}${delimiter}${originalPath ?? ""}`;
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    const server = await startReviewServer({
      rawPatch: "",
      gitRef: "test",
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
      prMetadata: {
        host: "github.com",
        owner: "owner",
        repo: "repo",
        number: 1,
        prNodeId: "node-1",
        title: "Test PR",
        author: "author",
        baseBranch: "main",
        headBranch: "feature",
        baseSha: "base-sha",
        headSha: "head-sha",
        url: "https://github.com/owner/repo/pull/1",
      },
    });

    try {
      const response = await fetch(`${server.url}/api/pr-viewed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePaths: "src/app.ts", viewed: "true" }),
      });

      expect(response.status).toBe(400);
    } finally {
      server.stop();
    }
  });

  test("workspace mode maps prefixed paths to child repos", async () => {
    const homeDir = makeTempDir("plannotator-pi-home-");
    const root = makeTempDir("plannotator-pi-workspace-");
    const apiDir = join(root, "api");
    const semDir = makeTempDir("plannotator-pi-workspace-switch-sem-");
    const cwdLogPath = join(semDir, "cwd-log");
    const inputLogPath = join(semDir, "input.patch");
    mkdirSync(apiDir, { recursive: true });
    process.env.HOME = homeDir;
    process.env.PLANNOTATOR_PORT = String(await reservePort());
    process.env.PLANNOTATOR_SEM_PATH = makeMockSem(semDir, {
      runCwdLogPath: cwdLogPath,
      inputLogPath,
    });

    git(apiDir, ["init"]);
    git(apiDir, ["branch", "-M", "main"]);
    git(apiDir, ["config", "user.email", "pi-review@example.com"]);
    git(apiDir, ["config", "user.name", "Pi Review"]);
    writeFileSync(join(apiDir, "tracked.txt"), "before\n", "utf-8");
    git(apiDir, ["add", "tracked.txt"]);
    git(apiDir, ["commit", "-m", "initial"]);
    writeFileSync(join(apiDir, "tracked.txt"), "after\n", "utf-8");

    const workspace = await WorkspaceReviewSession.create(
      {
        getGitContext,
        runGitDiff,
        getFileContentsForDiff,
        gitAddFile,
        gitResetFile,
      },
      root,
    );

    const server = await startReviewServer({
      rawPatch: workspace.rawPatch,
      gitRef: workspace.gitRef,
      error: workspace.error,
      diffType: workspace.diffType,
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
      workspace,
      agentCwd: root,
    });

    try {
      const diffResponse = await fetch(`${server.url}/api/diff`);

      const diffPayload: {
        mode?: string;
        agentCwd?: string;
        diffType?: string;
        diffOptions?: Array<{ id: string }>;
        semanticDiff?: { available: boolean };
      } = await diffResponse.json();

      expect(diffPayload.mode).toBe("workspace");
      expect(diffPayload.diffType).toBe("workspace-current");
      expect(diffPayload.diffOptions?.map((option) => option.id)).toContain("workspace-last");
      expect(diffPayload.agentCwd).toBe(root);
      expect("workspace" in diffPayload).toBe(false);

      const semanticPayload: {
        status: string;
      } = await fetch(`${server.url}/api/semantic-diff`).then((response) => response.json());

      expect(semanticPayload.status).toBe("ok");
      expect(realpathSync(readFileSync(cwdLogPath, "utf-8").trim())).toBe(realpathSync(root));
      expect(readFileSync(inputLogPath, "utf-8")).toContain(
        "diff --git a/api/tracked.txt b/api/tracked.txt",
      );

      const switchResponse = await fetch(`${server.url}/api/diff/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diffType: "workspace-last", hideWhitespace: true }),
      });

      expect(switchResponse.status).toBe(200);

      const switched: {
        diffType?: string;
        diffOptions?: Array<{ id: string }>;
        semanticDiff?: { available: boolean };
      } = await switchResponse.json();

      expect(switched.diffType).toBe("workspace-last");
      expect(switched.diffOptions?.map((option) => option.id)).toContain("workspace-current");

      const currentResponse = await fetch(`${server.url}/api/diff/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diffType: "workspace-current", hideWhitespace: false }),
      });

      expect(currentResponse.status).toBe(200);

      const fileContentResponse = await fetch(
        `${server.url}/api/file-content?path=api/tracked.txt`,
      );

      expect(fileContentResponse.status).toBe(200);

      const fileContent: {
        oldContent: string | null;
        newContent: string | null;
      } = await fileContentResponse.json();

      expect(fileContent.oldContent).toBe("before\n");
      expect(fileContent.newContent).toBe("after\n");

      const stageResponse = await fetch(`${server.url}/api/git-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: "api/tracked.txt" }),
      });

      expect(stageResponse.status).toBe(200);
      expect(git(apiDir, ["diff", "--staged", "--name-only"])).toContain("tracked.txt");

      const invalidStageResponse = await fetch(`${server.url}/api/git-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: "api/../tracked.txt" }),
      });

      expect(invalidStageResponse.status).toBe(400);
    } finally {
      server.stop();
    }
  }, 15_000);

  test("round-trips the active base branch through /api/diff and /api/diff/switch", async () => {
    const homeDir = makeTempDir("plannotator-pi-home-");
    const repoDir = initRepo();
    process.env.HOME = homeDir;
    process.chdir(repoDir);
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    // Create a second branch the picker can switch to, then branch off it so
    // currentBranch !== defaultBranch and the branch/merge-base options appear.
    git(repoDir, ["checkout", "-b", "develop"]);
    writeFileSync(join(repoDir, "develop-file.txt"), "develop\n", "utf-8");
    git(repoDir, ["add", "develop-file.txt"]);
    git(repoDir, ["commit", "-m", "develop commit"]);
    git(repoDir, ["checkout", "-b", "feature/x"]);
    writeFileSync(join(repoDir, "feature-file.txt"), "feature\n", "utf-8");
    git(repoDir, ["add", "feature-file.txt"]);
    git(repoDir, ["commit", "-m", "feature commit"]);

    const gitContext = await getGitContext();
    const diff = await runGitDiff("uncommitted", gitContext.defaultBranch);

    const server = await startReviewServer({
      rawPatch: diff.patch,
      gitRef: diff.label,
      error: diff.error,
      diffType: "uncommitted",
      gitContext,
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const invalidWorkspaceSwitch = await fetch(`${server.url}/api/diff/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diffType: "workspace-current" }),
      });

      expect(invalidWorkspaceSwitch.status).toBe(400);

      // Initial load: server echoes the detected default as the active base.
      const initial: {
        base?: string;
        gitContext?: { defaultBranch: string };
      } = await fetch(`${server.url}/api/diff`).then((r) => r.json());

      expect(initial.base).toBe(gitContext.defaultBranch);
      expect(initial.base).toBe(initial.gitContext?.defaultBranch);

      // Switch to a custom base — response must echo the resolved base.
      const switchResponse = await fetch(`${server.url}/api/diff/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diffType: "branch", base: "develop" }),
      });

      expect(switchResponse.status).toBe(200);
      const switched: { base?: string; diffType: string } = await switchResponse.json();
      expect(switched.base).toBe("develop");
      expect(switched.diffType).toBe("branch");

      const stageWhileOnBranch = await fetch(`${server.url}/api/git-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: "feature-file.txt" }),
      });

      expect(stageWhileOnBranch.status).toBe(400);
      expect(await stageWhileOnBranch.json()).toEqual({ error: "Staging not available" });

      // Subsequent /api/diff load reflects the switched base — this is what
      // survives a page refresh / reconnect.
      const rehydrate: {
        base?: string;
      } = await fetch(`${server.url}/api/diff`).then((r) => r.json());

      expect(rehydrate.base).toBe("develop");

      // Unknown refs pass through verbatim — the resolver trusts callers so
      // unusual-but-valid refs (tags, SHAs, non-origin remotes) work. Truly
      // invalid refs surface via the diff error, not via a silent swap.
      const unknownResponse = await fetch(`${server.url}/api/diff/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diffType: "branch", base: "nope-does-not-exist" }),
      });

      const unknown: { base?: string; error?: string } = await unknownResponse.json();
      expect(unknown.base).toBe("nope-does-not-exist");
      expect(unknown.error).toBeTruthy();

      // Feedback to clean up the waitForDecision promise.
      await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: false, feedback: "done", annotations: [] }),
      });
      await server.waitForDecision();
    } finally {
      server.stop();
    }
  }, 15_000);

  test("initialBase overrides gitContext.defaultBranch in server state", async () => {
    // Simulates a programmatic caller (Pi event bus, other extensions) that
    // opens a review against a non-default base. The server's currentBase —
    // which drives /api/diff, agent prompts, and file-content fetches — must
    // honor that override instead of falling back to the detected default.
    const homeDir = makeTempDir("plannotator-pi-home-");
    const repoDir = initRepo();
    process.env.HOME = homeDir;
    process.chdir(repoDir);
    process.env.PLANNOTATOR_PORT = String(await reservePort());

    git(repoDir, ["checkout", "-b", "develop"]);
    writeFileSync(join(repoDir, "develop-file.txt"), "develop\n", "utf-8");
    git(repoDir, ["add", "develop-file.txt"]);
    git(repoDir, ["commit", "-m", "develop commit"]);
    git(repoDir, ["checkout", "-b", "feature/x"]);

    const gitContext = await getGitContext();
    // Detected default is "main"; caller explicitly wants "develop".
    expect(gitContext.defaultBranch).toBe("main");
    const diff = await runGitDiff("branch", "develop");

    const server = await startReviewServer({
      rawPatch: diff.patch,
      gitRef: diff.label,
      error: diff.error,
      diffType: "branch",
      gitContext,
      initialBase: "develop",
      origin: "pi",
      htmlContent: "<!doctype html><html><body>review</body></html>",
    });

    try {
      const payload: {
        base?: string;
        gitContext?: { defaultBranch: string };
      } = await fetch(`${server.url}/api/diff`).then((r) => r.json());

      // The server must echo the caller's override, not the detected default.
      expect(payload.base).toBe("develop");
      expect(payload.gitContext?.defaultBranch).toBe("main");

      await fetch(`${server.url}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: false, feedback: "done", annotations: [] }),
      });
      await server.waitForDecision();
    } finally {
      server.stop();
    }
  }, 15_000);
});
