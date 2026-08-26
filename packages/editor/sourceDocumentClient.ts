import {
  type SourceFileEol,
  type SourceSaveCapability,
  type SourceSaveRequest,
  SourceSaveCapabilitySchema,
  SourceSaveResponseSchema,
} from "@plannotator/shared/source-save";
import { Option, Schema } from "effect";

type EnabledSourceSaveCapability = Extract<SourceSaveCapability, { enabled: true }>;

export type SourceSaveProbeResult =
  | { status: "ok"; sourceSave: EnabledSourceSaveCapability }
  | { status: "missing" }
  | { status: "unavailable" };

const SourceDocumentResponseSchema = Schema.Struct({
  markdown: Schema.optionalKey(Schema.String),
  sourceSave: Schema.optionalKey(SourceSaveCapabilitySchema),
  renderAs: Schema.optionalKey(Schema.Literals(["markdown", "html"])),
});

type SourceDocumentResponse = Schema.Schema.Type<typeof SourceDocumentResponseSchema>;

type SourceDocumentFetchResult =
  | { status: "ok"; data: SourceDocumentResponse }
  | { status: "missing" }
  | { status: "unavailable" };

export interface SourceDocumentSnapshot {
  markdown: string;
  sourceSave: EnabledSourceSaveCapability;
}

export type SourceDocumentSnapshotResult =
  | { status: "ok"; snapshot: SourceDocumentSnapshot }
  | { status: "missing" }
  | { status: "unavailable" };

/** The complete disk metadata returned after a source-backed document save. */
export interface SourceDocumentSaveMetadata {
  hash: string;
  mtimeMs: number;
  size: number;
  eol: SourceFileEol;
}

/** A source-backed document Save response containing the current disk text. */
export interface SourceDocumentSaveConflictSnapshot extends SourceDocumentSaveMetadata {
  text: string;
}

/** The typed request sent to the source-backed document Save endpoint. */
export type SourceDocumentSaveRequest = SourceSaveRequest;

/** The source-backed document Save outcomes exposed to the lifecycle module. */
export type SourceDocumentSaveResult =
  | { status: "saved"; sourceSave: SourceDocumentSaveMetadata }
  | { status: "conflict"; message: string; snapshot: SourceDocumentSaveConflictSnapshot }
  | { status: "conflict-incomplete"; message: string }
  | {
      status: "error";
      code:
        | "invalid-response"
        | "unavailable"
        | "not-writable"
        | "write-failed"
        | "invalid-request";
      message: string;
    };

async function fetchSourceDocument(path: string): Promise<SourceDocumentFetchResult> {
  try {
    const res = await fetch(`/api/doc?path=${encodeURIComponent(path)}`);
    if (res.status === 404) return { status: "missing" };
    if (!res.ok) return { status: "unavailable" };
    const data = Option.getOrUndefined(
      Schema.decodeUnknownOption(SourceDocumentResponseSchema)(await res.json()),
    );
    return data ? { status: "ok", data } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function probeSourceSave(path: string): Promise<SourceSaveProbeResult> {
  const result = await fetchSourceDocument(path);
  if (result.status !== "ok") return { status: result.status };

  const { sourceSave } = result.data;
  if (sourceSave?.enabled) return { status: "ok", sourceSave };
  if (sourceSave?.enabled === false && sourceSave.reason === "missing-file") {
    return { status: "missing" };
  }
  return { status: "unavailable" };
}

export async function fetchSourceDocumentSnapshot(
  path: string,
): Promise<SourceDocumentSnapshotResult> {
  const result = await fetchSourceDocument(path);
  if (result.status !== "ok") return { status: result.status };

  const { markdown, renderAs, sourceSave } = result.data;
  if (sourceSave?.enabled === false && sourceSave.reason === "missing-file") {
    return { status: "missing" };
  }
  if (renderAs === "html" || markdown === undefined || !sourceSave?.enabled)
    return { status: "unavailable" };
  return { status: "ok", snapshot: { markdown, sourceSave } };
}

/** Save a source-backed document through the browser source-save endpoint. */
export async function saveSourceDocument(
  input: SourceDocumentSaveRequest,
): Promise<SourceDocumentSaveResult> {
  let response: Response;
  try {
    response = await fetch("/api/source/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { status: "error", code: "unavailable", message: "Save failed" };
  }

  const payload = Option.getOrUndefined(
    Schema.decodeUnknownOption(SourceSaveResponseSchema)(await response.json().catch(() => null)),
  );
  if (!payload) {
    return { status: "error", code: "invalid-response", message: "Save failed" };
  }

  if (!response.ok && payload.ok) {
    return { status: "error", code: "invalid-response", message: "Save failed" };
  }

  if (payload.ok) {
    return {
      status: "saved",
      sourceSave: {
        hash: payload.hash,
        mtimeMs: payload.mtimeMs,
        size: payload.size,
        eol: payload.eol,
      },
    };
  }

  const message = payload.message;
  if (payload.code === "conflict") {
    if (
      payload.currentText === undefined ||
      payload.currentHash === undefined ||
      payload.currentMtimeMs === undefined ||
      payload.currentSize === undefined ||
      payload.currentEol === undefined
    ) {
      return { status: "conflict-incomplete", message };
    }
    return {
      status: "conflict",
      message,
      snapshot: {
        text: payload.currentText,
        hash: payload.currentHash,
        mtimeMs: payload.currentMtimeMs,
        size: payload.currentSize,
        eol: payload.currentEol,
      },
    };
  }

  if (
    payload.code === "not-writable" ||
    payload.code === "write-failed" ||
    payload.code === "invalid-request"
  ) {
    return { status: "error", code: payload.code, message };
  }
  return { status: "error", code: "invalid-response", message };
}
