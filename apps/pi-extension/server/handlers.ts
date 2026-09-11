/**
 * Shared request handlers reused across plan, review, and annotate servers.
 * handleImageRequest, handleUploadRequest, handleDraftRequest, handleFavicon
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import {
  decodeDraftEnvelope,
  saveDraft,
  loadDraft,
  deleteDraft,
  getDraftGeneration,
} from "../generated/draft.js";
import { FAVICON_SVG } from "../generated/favicon.js";

import { json, send, toWebRequest } from "./helpers";
import { type IntegrationResult, saveToObsidian } from "./integrations.js";
import { Option, Schema } from "effect";

type Res = import("node:http").ServerResponse;

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "tiff",
  "tif",
  "avif",
]);

interface ImageContentTypeMap {
  [ext: string]: string;
}

const IMAGE_CONTENT_TYPES: ImageContentTypeMap = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
  avif: "image/avif",
};

const UPLOAD_DIR = join(tmpdir(), "plannotator");

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");

  if (lastDot === -1) return "";

  return filePath.slice(lastDot + 1).toLowerCase();
}

interface ImagePathValidation {
  valid: boolean;
  resolved: string;
  error?: string;
}

interface DraftNotFoundResponse {
  found: false;
  draftGeneration?: number;
}

interface UploadExtensionValidation {
  valid: boolean;
  ext: string;
  error?: string;
}

function validateImagePath(rawPath: string): ImagePathValidation {
  const resolved = resolvePath(rawPath);
  const ext = getExtension(resolved);

  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      resolved,
      error: "Path does not point to a supported image file",
    };
  }

  return { valid: true, resolved };
}

function validateUploadExtension(fileName: string): UploadExtensionValidation {
  const ext = getExtension(fileName) || "png";

  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      ext,
      error: `File extension ".${ext}" is not a supported image type`,
    };
  }

  return { valid: true, ext };
}

function getImageContentType(filePath: string): string {
  return IMAGE_CONTENT_TYPES[getExtension(filePath)] || "application/octet-stream";
}

function isUploadFile(file: FormDataEntryValue | null): file is File {
  return file !== null && "arrayBuffer" in Object(file) && "name" in Object(file);
}

export function handleImageRequest(res: Res, url: URL): void {
  const imagePath = url.searchParams.get("path");

  if (!imagePath) {
    send(res, "Missing path parameter", 400, { "Content-Type": "text/plain" });

    return;
  }

  const tryServePath = (candidate: string): boolean => {
    const validation = validateImagePath(candidate);

    if (!validation.valid) return false;

    try {
      if (!existsSync(validation.resolved)) return false;
      const data = readFileSync(validation.resolved);
      send(res, data, 200, {
        "Content-Type": getImageContentType(validation.resolved),
      });

      return true;
    } catch {
      return false;
    }
  };

  if (tryServePath(imagePath)) return;

  const base = url.searchParams.get("base");

  if (base && !imagePath.startsWith("/") && tryServePath(resolvePath(base, imagePath))) {
    return;
  }

  const validation = validateImagePath(imagePath);

  if (!validation.valid) {
    send(res, validation.error || "Invalid image path", 403, {
      "Content-Type": "text/plain",
    });

    return;
  }

  send(res, "File not found", 404, { "Content-Type": "text/plain" });
}

export async function handleUploadRequest(req: IncomingMessage, res: Res): Promise<void> {
  try {
    const request = toWebRequest(req);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!isUploadFile(file)) {
      json(res, { error: "No file provided" }, 400);

      return;
    }

    const extResult = validateUploadExtension(file.name);

    if (!extResult.valid) {
      json(res, { error: extResult.error }, 400);

      return;
    }

    mkdirSync(UPLOAD_DIR, { recursive: true });
    const tempPath = join(UPLOAD_DIR, `${randomUUID()}.${extResult.ext}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    writeFileSync(tempPath, bytes);
    json(res, { path: tempPath, originalName: file.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    json(res, { error: message }, 500);
  }
}

export function handleDraftRequest(
  req: IncomingMessage,
  res: Res,
  draftKey: string,
): Promise<void> | void {
  if (req.method === "POST") {
    return toWebRequest(req)
      .json()
      .catch(() => ({}))
      .then((rawBody) => {
        const body = decodeDraftEnvelope(rawBody);

        if (body === null) {
          json(res, { error: "Invalid draft" }, 400);

          return;
        }

        saveDraft(draftKey, body);
        json(res, { ok: true });
      })
      .catch((err: Error) => {
        const message = err instanceof Error ? err.message : "Failed to save draft";
        console.error(`[draft] save failed: ${message}`);
        json(res, { error: message }, 500);
      });
  } else if (req.method === "DELETE") {
    deleteDraft(draftKey, readDraftGenerationFromUrl(req));
    json(res, { ok: true });
  } else {
    const draft = loadDraft(draftKey);

    if (!draft) {
      const draftGeneration = getDraftGeneration(draftKey);
      const notFoundResponse: DraftNotFoundResponse = { found: false };

      if (draftGeneration !== null) notFoundResponse.draftGeneration = draftGeneration;
      json(res, notFoundResponse, 404);

      return;
    }

    json(res, draft);
  }
}

function readDraftGenerationFromUrl(req: IncomingMessage): number | undefined {
  const url = new URL(req.url ?? "/", "http://localhost");
  const raw = url.searchParams.get("generation") ?? url.searchParams.get("draftGeneration");

  if (raw === null) return undefined;
  const value = Number(raw);

  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

export { readDraftGenerationFromUrl };

export function handleFavicon(res: Res): void {
  send(res, FAVICON_SVG, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=86400",
  });
}

/** Save to Obsidian. Used by plan and annotate servers. */
interface SaveNotesResults {
  obsidian?: IntegrationResult;
}

const ObsidianConfigSchema = Schema.Struct({
  vaultPath: Schema.String,
  folder: Schema.String,
  plan: Schema.String,
  filenameFormat: Schema.optionalKey(Schema.String),
  filenameSeparator: Schema.optionalKey(Schema.Literals(["space", "dash", "underscore"])),
});

const SaveNotesBodySchema = Schema.Record(Schema.String, Schema.Unknown);

export async function handleSaveNotesRequest(req: IncomingMessage, res: Res): Promise<void> {
  const results: SaveNotesResults = {};

  try {
    const body = Option.getOrUndefined(
      Schema.decodeUnknownOption(SaveNotesBodySchema)(await toWebRequest(req).json()),
    );

    if (!body) {
      json(res, { error: "Invalid JSON" }, 400);

      return;
    }

    if (Object.keys(body).some((target) => target !== "obsidian")) {
      json(res, { error: "Unsupported save target" }, 400);

      return;
    }

    const promises: Promise<void>[] = [];

    if (Object.hasOwn(body, "obsidian")) {
      const obsConfig = Option.getOrUndefined(
        Schema.decodeUnknownOption(ObsidianConfigSchema)(body.obsidian),
      );

      if (!obsConfig) {
        results.obsidian = { success: false, error: "Invalid Obsidian save configuration" };
      } else if (obsConfig.vaultPath && obsConfig.plan) {
        promises.push(
          saveToObsidian(obsConfig).then((r) => {
            results.obsidian = r;
          }),
        );
      }
    }

    await Promise.allSettled(promises);

    for (const [name, result] of Object.entries(results)) {
      if (!result?.success && result) console.error(`[${name}] Save failed: ${result.error}`);
    }
  } catch (err) {
    console.error(`[Save Notes] Error:`, err);
    json(res, { error: "Save failed" }, 500);

    return;
  }

  json(res, { ok: true, results });
}
