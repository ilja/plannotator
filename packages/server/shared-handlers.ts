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
import { saveDraft, loadDraft, deleteDraft, getDraftGeneration } from "./draft";
import { FAVICON_SVG } from "@plannotator/shared/favicon";
import { saveToObsidian, saveToBear, saveToOctarine } from "./integrations";
import type { ObsidianConfig, BearConfig, OctarineConfig, IntegrationResult } from "./integrations";

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

/** Upload image to temp dir, return path. Used by all 3 servers. */
export async function handleUpload(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    // SAFETY: form field "file" is written by our own upload form as a File; non-File values are treated as missing.
    const file = formData.get("file") as File;
    if (!file) {
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

 /** OpenCode agent client interface (subset of OpenCode SDK) */
export interface OpencodeClient {
  app: {
    agents: (options?: AgentListOptions) => Promise<{
      data?: Array<{ name: string; description?: string; mode: string; hidden?: boolean }>;
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
    const agents = (result.data ?? [])
      .filter((a) => a.mode === "primary" && !a.hidden)
      .map((a) => ({ id: a.name, name: a.name, description: a.description }));

    return Response.json({ agents });
  } catch {
    return Response.json({ agents: [], error: "Failed to fetch agents" });
  }
}

/** Save annotation draft. Used by all 3 servers. */
export async function handleDraftSave(req: Request, contentKey: string): Promise<Response> {
  try {
    const body = await req.json();
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

interface SaveNotesRequest {
  readonly obsidian?: ObsidianConfig;
  readonly bear?: BearConfig;
  readonly octarine?: OctarineConfig;
}

/** Save to external note apps (Obsidian, Bear, Octarine). Used by plan + annotate servers. */
export async function handleSaveNotes(req: Request): Promise<Response> {
  const results: SaveNotesResults = {};

  try {
    const rawBody: SaveNotesRequest = await req.json();

    const promises: Promise<void>[] = [];
    if (rawBody.obsidian?.vaultPath && rawBody.obsidian?.plan) {
      promises.push(saveToObsidian(rawBody.obsidian).then(r => { results.obsidian = r; }));
    }
    if (rawBody.bear?.plan) {
      promises.push(saveToBear(rawBody.bear).then(r => { results.bear = r; }));
    }
    if (rawBody.octarine?.plan && rawBody.octarine?.workspace) {
      promises.push(saveToOctarine(rawBody.octarine).then(r => { results.octarine = r; }));
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
