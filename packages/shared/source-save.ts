import { Option, Schema } from "effect";

export type SourceSaveLanguage = "markdown" | "mdx" | "text";

export type SourceSaveDisabledReason =
  | "not-annotate-mode"
  | "not-local-file"
  | "unsupported-extension"
  | "converted-source"
  | "html-render"
  | "folder-mode"
  | "message-mode"
  | "shared-session"
  | "missing-file"
  | "unreadable-file";

export type SourceSaveScope = "single-file" | "folder-file";

export type SourceFileEol = "lf" | "crlf" | "mixed" | "none";

export interface SourceFileSnapshot {
  text: string;
  hash: string;
  mtimeMs: number;
  size: number;
  eol: SourceFileEol;
}

export type SourceSaveCapability =
  | {
      enabled: true;
      kind: "local-text-file";
      scope: SourceSaveScope;
      path: string;
      basename: string;
      language: SourceSaveLanguage;
      hash: string;
      mtimeMs: number;
      size: number;
      eol: SourceFileEol;
    }
  | {
      enabled: false;
      reason: SourceSaveDisabledReason;
    };

export interface SourceSaveRequest {
  path?: string;
  text: string;
  baseHash: string;
  baseMtimeMs?: number;
  baseEol?: SourceFileEol;
  allowMissingBase?: boolean;
}

/** Boundary schema for POST /api/source/save bodies; keep in sync with `SourceSaveRequest`. */
export const SourceSaveRequestSchema = Schema.Struct({
  path: Schema.optionalKey(Schema.String),
  text: Schema.String,
  baseHash: Schema.String,
  baseMtimeMs: Schema.optionalKey(Schema.Number),
  baseEol: Schema.optionalKey(Schema.Literals(["lf", "crlf", "mixed", "none"])),
  allowMissingBase: Schema.optionalKey(Schema.Boolean),
});

export type SourceSaveResponse =
  | {
      ok: true;
      hash: string;
      mtimeMs: number;
      size: number;
      eol: SourceFileEol;
    }
  | {
      ok: false;
      code: "conflict";
      message: string;
      currentText: string;
      currentHash: string;
      currentMtimeMs: number;
      currentSize: number;
      currentEol: SourceFileEol;
    }
  | {
      ok: false;
      code: "not-writable" | "write-failed" | "invalid-request";
      message: string;
    };

export type SourceSaveConflictResponse = Extract<
  SourceSaveResponse,
  { ok: false; code: "conflict" }
>;

export const SourceFileEolSchema = Schema.Literals(["lf", "crlf", "mixed", "none"]);

export const SourceSaveCapabilitySchema = Schema.Union([
  Schema.Struct({
    enabled: Schema.Literal(true),
    kind: Schema.Literal("local-text-file"),
    scope: Schema.Literals(["single-file", "folder-file"]),
    path: Schema.String,
    basename: Schema.String,
    language: Schema.Literals(["markdown", "mdx", "text"]),
    hash: Schema.String,
    mtimeMs: Schema.Number,
    size: Schema.Number,
    eol: SourceFileEolSchema,
  }),
  Schema.Struct({
    enabled: Schema.Literal(false),
    reason: Schema.Literals([
      "not-annotate-mode",
      "not-local-file",
      "unsupported-extension",
      "converted-source",
      "html-render",
      "folder-mode",
      "message-mode",
      "shared-session",
      "missing-file",
      "unreadable-file",
    ]),
  }),
]);

// The conflict variant keeps the current* disk-fields optional: the source
// document client preserves its "conflict-incomplete" outcome when a conflict
// payload omits the disk snapshot fields.
export const SourceSaveResponseSchema = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    hash: Schema.String,
    mtimeMs: Schema.Number,
    size: Schema.Number,
    eol: SourceFileEolSchema,
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    code: Schema.Literal("conflict"),
    message: Schema.String,
    currentText: Schema.optionalKey(Schema.String),
    currentHash: Schema.optionalKey(Schema.String),
    currentMtimeMs: Schema.optionalKey(Schema.Number),
    currentSize: Schema.optionalKey(Schema.Number),
    currentEol: Schema.optionalKey(SourceFileEolSchema),
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    code: Schema.Literals(["not-writable", "write-failed", "invalid-request"]),
    message: Schema.String,
  }),
]);

export function isSourceFileEol(value: any): value is SourceFileEol {
  return (
    Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.Literals(["lf", "crlf", "mixed", "none"]))(value),
    ) !== undefined
  );
}

export function hasSourceSaveConflictSnapshot(
  response: SourceSaveResponse,
): response is SourceSaveConflictResponse {
  if (!("code" in response) || response.code !== "conflict") return false;
  // SAFETY: guarded by response.code === "conflict" above
  const conflict = response as SourceSaveConflictResponse;
  return (
    Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(conflict.currentText)) !==
      undefined &&
    Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(conflict.currentHash)) !==
      undefined &&
    Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Number)(conflict.currentMtimeMs)) !==
      undefined &&
    Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Number)(conflict.currentSize)) !==
      undefined &&
    isSourceFileEol(conflict.currentEol)
  );
}

export const SOURCE_SAVE_FILE_REGEX = /\.(md|mdx|txt)$/i;

export function isSourceSaveFilePath(filePath: string): boolean {
  return SOURCE_SAVE_FILE_REGEX.test(filePath);
}

export function getSourceSaveLanguage(filePath: string): SourceSaveLanguage | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".mdx")) return "mdx";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".txt")) return "text";
  return null;
}

export function basenameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.split("/").pop() || filePath;
}

export function disabledSourceSave(reason: SourceSaveDisabledReason): SourceSaveCapability {
  return { enabled: false, reason };
}

export function enabledSourceSave(
  scope: SourceSaveScope,
  filePath: string,
  snapshot: SourceFileSnapshot,
): SourceSaveCapability {
  const language = getSourceSaveLanguage(filePath);
  if (!language) return disabledSourceSave("unsupported-extension");
  return {
    enabled: true,
    kind: "local-text-file",
    scope,
    path: filePath,
    basename: basenameFromPath(filePath),
    language,
    hash: snapshot.hash,
    mtimeMs: snapshot.mtimeMs,
    size: snapshot.size,
    eol: snapshot.eol,
  };
}
