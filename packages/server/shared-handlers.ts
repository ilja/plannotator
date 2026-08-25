/**
 * Shared route handlers used by plan, review, and annotate servers.
 *
 * Eliminates duplication of /api/image, /api/upload, /api/draft, and the
 * server-ready handler across all three server files. Also shares /api/agents
 * for plan + review.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Option, Schema } from "effect";
import { openBrowser as openBrowserImpl } from "./browser";
import { validateImagePath, validateUploadExtension, UPLOAD_DIR } from "./image";
import { decodeDraftEnvelope, saveDraft, loadDraft, deleteDraft, getDraftGeneration } from "./draft";
import { FAVICON_SVG } from "@plannotator/shared/favicon";
import { saveToObsidian, saveToBear, saveToOctarine } from "./integrations";
import type { IntegrationResult } from "./integrations";

const DraftGenerationSchema = Schema.Natural;

function normalizeDraftGeneration(value: number): number | undefined {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

interface DraftBodyCarrier {
  readonly draftGeneration?: unknown;
}

export function readDraftGenerationFromUrl(req: Request): number | undefined {
  const url = new URL(req.url);
  const raw = url.searchParams.get("generation") ?? url.searchParams.get("draftGeneration");
  if (raw === null) return undefined;
  const value = Number(raw);
  if (Number.isNaN(value)) return undefined;
  return normalizeDraftGeneration(value);
}

export function readDraftGenerationFromBody(body: DraftBodyCarrier): number | undefined {
  return Option.getOrUndefined(
    Schema.decodeUnknownOption(DraftGenerationSchema)(body.draftGeneration),
  );
}

/** Serve images from local paths or temp uploads. Used by all 3 servers. */
export async function handleImage(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const imagePath = url.searchParams.get("path");
  if (!imagePath) {
    return new Response("Missing path parameter", { status: 400 });
  }
  const validation = validateImagePath(imagePath);
  if (!validation.valid) {
    return new Response(validation.error!, { status: 403 });
  }
  try {
    const file = Bun.file(validation.resolved);
    if (await file.exists()) {
      return new Response(file);
    }
    // If not found and a base directory is provided, try resolving relative to it
    const base = url.searchParams.get("base");
    if (base && !imagePath.startsWith("/")) {
      const { resolve: resolvePath } = await import("path");
      const fromBase = resolvePath(base, imagePath);
      const baseValidation = validateImagePath(fromBase);
      if (baseValidation.valid) {
        const baseFile = Bun.file(baseValidation.resolved);
        if (await baseFile.exists()) {
          return new Response(baseFile);
        }
      }
    }
    return new Response("File not found", { status: 404 });
  } catch {
    return new Response("Failed to read file", { status: 500 });
  }
}

function isUploadFile(file: FormDataEntryValue | null): file is File {
  return file !== null && "arrayBuffer" in Object(file) && "name" in Object(file);
}

/** Upload image to temp dir, return path. Used by all 3 servers. */
export async function handleUpload(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!isUploadFile(file)) {
      return new Response("No file provided", { status: 400 });
    }

    const extResult = validateUploadExtension(file.name);
    if (!extResult.valid) {
      return Response.json({ error: extResult.error }, { status: 400 });
    }
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const tempPath = `${UPLOAD_DIR}/${crypto.randomUUID()}.${extResult.ext}`;

    await Bun.write(tempPath, file);
    return Response.json({ path: tempPath, originalName: file.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

interface AgentListOptions {}

const OpencodeAgentSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),
  mode: Schema.String,
  hidden: Schema.optionalKey(Schema.Boolean),
});
const OpencodeAgentsResponseSchema = Schema.Struct({
  data: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.Json))),
});
const decodeOpencodeAgent = Schema.decodeUnknownOption(OpencodeAgentSchema);
const decodeOpencodeAgentsResponse = Schema.decodeUnknownOption(OpencodeAgentsResponseSchema);

/** OpenCode agent client interface (subset of OpenCode SDK) */
export interface OpencodeClient {
  app: {
    agents: (options?: AgentListOptions) => Promise<{
      data?: Schema.Schema.Type<typeof Schema.Json>;
    }>;
  };
}

/** List available agents. Used by plan + review servers (OpenCode only). */
export async function handleAgents(opencodeClient?: OpencodeClient): Promise<Response> {
  if (!opencodeClient) {
    return Response.json({ agents: [] });
  }

  try {
    const result = await opencodeClient.app.agents({});
    const response = Option.getOrUndefined(decodeOpencodeAgentsResponse(result));
    if (!response) {
      return Response.json({ agents: [], error: "Failed to fetch agents" });
    }
    const agents = (response.data ?? []).flatMap((rawAgent) => {
      const agent = Option.getOrUndefined(decodeOpencodeAgent(rawAgent));
      if (!agent || agent.mode !== "primary" || agent.hidden) return [];
      return [{ id: agent.name, name: agent.name, description: agent.description }];
    });

    return Response.json({ agents });
  } catch {
    return Response.json({ agents: [], error: "Failed to fetch agents" });
  }
}

/** Save annotation draft. Used by all 3 servers. */
export async function handleDraftSave(req: Request, contentKey: string): Promise<Response> {
  try {
    const body = decodeDraftEnvelope(await req.json());
    if (body === null) {
      return Response.json({ error: "Invalid draft" }, { status: 400 });
    }
    saveDraft(contentKey, body);
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save draft";
    console.error(`[draft] save failed: ${message}`);
    return Response.json({ error: message }, { status: 500 });
  }
}

interface DraftNotFoundBody {
  readonly found: false;
  draftGeneration?: number;
}

/** Load annotation draft. Used by all 3 servers. */
export function handleDraftLoad(contentKey: string): Response {
  const draft = loadDraft(contentKey);
  if (!draft) {
    const draftGeneration = getDraftGeneration(contentKey);
    const notFoundBody: DraftNotFoundBody = { found: false };
    if (draftGeneration !== null) notFoundBody.draftGeneration = draftGeneration;
    return Response.json(notFoundBody, { status: 404 });
  }
  return Response.json(draft);
}

/** Delete annotation draft. Used by all 3 servers. */
export function handleDraftDelete(contentKey: string, req?: Request): Response {
  deleteDraft(contentKey, req ? readDraftGenerationFromUrl(req) : undefined);
  return Response.json({ ok: true });
}



/** Serve the app favicon. Used by all 3 servers. */
export function handleFavicon(): Response {
  return new Response(FAVICON_SVG, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  });
}

interface ServerReadyOptions {
  readyFile?: string;
  skipBrowserOpen?: boolean;
  openBrowser?: typeof openBrowserImpl;
}

export interface ServerReadyMetadata {
  url: string;
  isRemote: boolean;
  port: number;
}

export function writeServerReadyMetadata(readyFile: string, metadata: ServerReadyMetadata): void {
  mkdirSync(dirname(readyFile), { recursive: true });
  appendFileSync(readyFile, `${JSON.stringify(metadata)}\n`, "utf8");
}

export function isCodexDesktopHost(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.__CFBundleIdentifier === "com.openai.codex";
}

/** Attempt to open the browser for the session URL. */
export async function handleServerReady(
  url: string,
  isRemote: boolean,
  port: number,
  options: ServerReadyOptions = {},
): Promise<void> {
  const readyFile = options.readyFile ?? process.env.PLANNOTATOR_READY_FILE;
  if (readyFile) {
    try {
      writeServerReadyMetadata(readyFile, { url, isRemote, port });
    } catch (error) {
      if (options.readyFile) throw error;
      // Best effort: host plugins use this side channel to open the browser.
    }
  }

  // A remote/SSH session can't pop a browser on the user's machine, so the
  // session URL must be visible in the terminal — independently of whether URL
  // sharing is enabled. The share link (gated on sharing) is an extra; this
  // reachable URL is the lifeline. Without it, a sharing-disabled remote user
  // saw no URL at all and the agent hung waiting on the review.
  if (isRemote) {
    process.stderr.write(
      `\n  Plannotator session ready — open on your local machine (forward port ${port} if needed):\n  ${url}\n\n`,
    );
  } else if (isCodexDesktopHost()) {
    process.stderr.write(`\n  Plannotator session ready:\n  ${url}\n\n`);
  }

  const skipBrowserOpen = options.skipBrowserOpen ?? process.env.PLANNOTATOR_SKIP_BROWSER_OPEN === "1";
  if (skipBrowserOpen) return;

  const opened = await (options.openBrowser ?? openBrowserImpl)(url, { isRemote, useGlimpse: true });

  // Local fallback lifeline: if the browser couldn't be opened (headless box,
  // devcontainer with no display, broken open/xdg-open), the user otherwise has
  // no URL and the agent hangs at waitForDecision. Remote already printed the
  // URL above; only cover the local case here to avoid a double print.
  if (!opened && !isRemote) {
    process.stderr.write(`\n  Plannotator session ready — open in your browser:\n  ${url}\n\n`);
  }
}

interface SaveNotesResults {
  obsidian?: IntegrationResult;
  bear?: IntegrationResult;
  octarine?: IntegrationResult;
}

const SaveNotesBodySchema = Schema.Record(Schema.String, Schema.Unknown);

const ObsidianConfigSchema = Schema.Struct({
  vaultPath: Schema.String,
  folder: Schema.String,
  plan: Schema.String,
  filenameFormat: Schema.optionalKey(Schema.String),
  filenameSeparator: Schema.optionalKey(Schema.Literals(["space", "dash", "underscore"])),
});

const BearConfigSchema = Schema.Struct({
  plan: Schema.String,
  customTags: Schema.optionalKey(Schema.String),
  tagPosition: Schema.optionalKey(Schema.Literals(["prepend", "append"])),
});

const OctarineConfigSchema = Schema.Struct({
  plan: Schema.String,
  workspace: Schema.String,
  folder: Schema.String,
});

/** Save to external note apps (Obsidian, Bear, Octarine). Used by plan + annotate servers. */
export async function handleSaveNotes(req: Request): Promise<Response> {
  const results: SaveNotesResults = {};

  try {
    const rawBody: unknown = await req.json();
    const body = Schema.decodeUnknownOption(SaveNotesBodySchema)(rawBody);
    if (Option.isNone(body)) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const promises: Promise<void>[] = [];
    if (Object.hasOwn(body.value, "obsidian")) {
      const config = Schema.decodeUnknownOption(ObsidianConfigSchema)(body.value.obsidian);
      if (Option.isNone(config)) {
        results.obsidian = { success: false, error: "Invalid Obsidian save configuration" };
      } else if (config.value.vaultPath && config.value.plan) {
        promises.push(saveToObsidian(config.value).then(r => { results.obsidian = r; }));
      }
    }
    if (Object.hasOwn(body.value, "bear")) {
      const config = Schema.decodeUnknownOption(BearConfigSchema)(body.value.bear);
      if (Option.isNone(config)) {
        results.bear = { success: false, error: "Invalid Bear save configuration" };
      } else if (config.value.plan) {
        promises.push(saveToBear(config.value).then(r => { results.bear = r; }));
      }
    }
    if (Object.hasOwn(body.value, "octarine")) {
      const config = Schema.decodeUnknownOption(OctarineConfigSchema)(body.value.octarine);
      if (Option.isNone(config)) {
        results.octarine = { success: false, error: "Invalid Octarine save configuration" };
      } else if (config.value.plan && config.value.workspace) {
        promises.push(saveToOctarine(config.value).then(r => { results.octarine = r; }));
      }
    }
    await Promise.allSettled(promises);

    for (const [name, result] of Object.entries(results)) {
      if (!result?.success && result) {
        console.error(`[${name}] Save failed: ${result.error}`);
      }
    }
  } catch (err) {
    console.error(`[Save Notes] Error:`, err);
    return Response.json({ error: "Save failed" }, { status: 500 });
  }

  return Response.json({ ok: true, results });
}
