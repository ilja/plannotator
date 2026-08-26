/**
 * Portable sharing utilities for Plannotator
 *
 * Enables sharing plan + annotations via URL hash using:
 * - Native CompressionStream/DecompressionStream (deflate-raw)
 * - Base64url encoding for URL safety
 *
 * Inspired by textarea.my's approach.
 */

import { Option, Schema } from "effect";
import { Annotation, AnnotationType, type ImageAttachment } from "../types";
import { compress, decompress } from "@plannotator/shared/compress";
import { encrypt, decrypt } from "@plannotator/shared/crypto";
import { ChoiceValidationEvidenceSchema } from "./choiceAnnotations";

// Image in shareable format: plain string (old) or [path, name] tuple (new)
const ShareableImageSchema = Schema.Union([
  Schema.String,
  Schema.Tuple([Schema.String, Schema.String]),
]);
export type ShareableImage = Schema.Schema.Type<typeof ShareableImageSchema>;

const ShareableAnnotationSchema = Schema.Union([
  Schema.Tuple([
    Schema.Literal("D"),
    Schema.String,
    Schema.NullOr(Schema.String),
    Schema.optional(Schema.NullOr(Schema.Array(ShareableImageSchema))),
  ]),
  Schema.Tuple([
    Schema.Literal("C"),
    Schema.String,
    Schema.String,
    Schema.NullOr(Schema.String),
    Schema.optional(Schema.NullOr(Schema.Array(ShareableImageSchema))),
    Schema.optional(Schema.Literal(1)),
  ]),
  Schema.Tuple([
    Schema.Literal("R"),
    Schema.String,
    Schema.String,
    Schema.NullOr(Schema.String),
    Schema.optional(Schema.NullOr(Schema.Array(ShareableImageSchema))),
  ]),
  Schema.Tuple([
    Schema.Literal("I"),
    Schema.String,
    Schema.String,
    Schema.NullOr(Schema.String),
    Schema.optional(Schema.NullOr(Schema.Array(ShareableImageSchema))),
  ]),
  Schema.Tuple([
    Schema.Literal("G"),
    Schema.String,
    Schema.NullOr(Schema.String),
    Schema.optional(Schema.NullOr(Schema.Array(ShareableImageSchema))),
  ]),
]);
export type ShareableAnnotation = Schema.Schema.Type<typeof ShareableAnnotationSchema>;

const DiffContextSchema = Schema.Union([
  Schema.Literal("added"),
  Schema.Literal("removed"),
  Schema.Literal("modified"),
]);

const SharePayloadSchema = Schema.Struct({
  p: Schema.String,
  a: Schema.Array(ShareableAnnotationSchema),
  g: Schema.optional(Schema.Array(ShareableImageSchema)),
  d: Schema.optional(Schema.Array(Schema.NullOr(DiffContextSchema))),
  s: Schema.optional(Schema.Array(Schema.NullOr(Schema.String))),
  cv: Schema.optional(Schema.Array(Schema.NullOr(ChoiceValidationEvidenceSchema))),
  co: Schema.optional(Schema.Array(Schema.NullOr(Schema.String))),
  h: Schema.optional(Schema.String),
  r: Schema.optional(Schema.Literal("html")),
});
export type SharePayload = Schema.Schema.Type<typeof SharePayloadSchema>;

const LegacyShareDataSchema = Schema.Struct({
  a: Schema.Array(ShareableAnnotationSchema),
  g: Schema.optional(Schema.Array(ShareableImageSchema)),
  d: Schema.optional(Schema.Array(Schema.NullOr(DiffContextSchema))),
  ts: Schema.Number,
});
export type LegacyShareData = Schema.Schema.Type<typeof LegacyShareDataSchema>;

const isString = Schema.is(Schema.String);
const isDiffContext = Schema.is(DiffContextSchema);

const hasUniqueChoiceLabels = (
  evidence: NonNullable<NonNullable<SharePayload["cv"]>[number]>,
): boolean => {
  const labels = new Set(evidence.options.map((option) => option.label));
  return labels.size === evidence.options.length;
};

export function decodeSharePayload<Input>(value: Input): SharePayload | null {
  const decoded = Schema.decodeUnknownOption(SharePayloadSchema)(value);
  if (Option.isNone(decoded)) return null;

  const evidenceIsValid =
    decoded.value.cv?.every((evidence) => evidence === null || hasUniqueChoiceLabels(evidence)) ??
    true;
  return evidenceIsValid ? decoded.value : null;
}

export function decodeLegacyShareData<Input>(value: Input): LegacyShareData | null {
  return Option.getOrNull(Schema.decodeUnknownOption(LegacyShareDataSchema)(value));
}

/**
 * Convert ShareableImage[] to ImageAttachment[] (handles old plain-string format)
 */
export function parseShareableImages(
  raw: readonly ShareableImage[] | null | undefined,
): ImageAttachment[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map((image) => {
    if (isString(image)) {
      const name =
        image
          .split("/")
          .pop()
          ?.replace(/\.[^.]+$/, "") || "image";
      return { path: image, name };
    }
    return { path: image[0], name: image[1] };
  });
}

/**
 * Convert ImageAttachment[] to ShareableImage[] for compact serialization
 */
export function toShareableImages(
  images: readonly ImageAttachment[] | undefined,
): ShareableImage[] | undefined {
  if (!images?.length) return undefined;
  return images.map((img) => [img.path, img.name]);
}

// Re-export compress/decompress from shared package (single source of truth)
export { compress, decompress };

/**
 * Convert full Annotation objects to minimal shareable format
 */
export function toShareable(annotations: readonly Annotation[]): ShareableAnnotation[] {
  return annotations.map((ann) => {
    const author = ann.author || null;
    const images = toShareableImages(ann.images);

    // Handle GLOBAL_COMMENT specially - it starts with 'G' (from GLOBAL_COMMENT)
    if (ann.type === AnnotationType.GLOBAL_COMMENT) {
      return ["G", ann.text || "", author, images] satisfies ShareableAnnotation;
    }

    if (ann.type === AnnotationType.DELETION) {
      return ["D", ann.originalText, author, images] satisfies ShareableAnnotation;
    }

    // COMMENT
    if (ann.isQuickLabel) {
      return [
        "C",
        ann.originalText,
        ann.text || "",
        author,
        images ?? undefined,
        1,
      ] satisfies ShareableAnnotation;
    }
    return ["C", ann.originalText, ann.text || "", author, images] satisfies ShareableAnnotation;
  });
}

/**
 * Convert shareable format back to full Annotation objects
 * Note: blockId, offsets, and meta will need to be populated separately
 * by finding the text in the rendered document.
 */
export function fromShareable(
  data: readonly ShareableAnnotation[],
  diffContexts?: readonly (string | null)[] | null,
  sources?: SharePayload["s"] | null,
  choiceValidationEvidence?: SharePayload["cv"] | null,
  choiceOptionLabels?: SharePayload["co"] | null,
): Annotation[] {
  return data.map((item, index) => {
    const type = item[0];

    // Handle global comments specially: ['G', text, author, images?]
    if (type === "G") {
      const annotation: Annotation = {
        id: `shared-${index}-${Date.now()}`,
        blockId: "",
        startOffset: 0,
        endOffset: 0,
        type: AnnotationType.GLOBAL_COMMENT,
        text: item[1] || undefined,
        originalText: "",
        createdA: Date.now() + index,
        author: item[2] || undefined,
        images: parseShareableImages(item[3]),
      };
      if (sources?.[index]) annotation.source = sources[index];
      return annotation;
    }

    const originalText = item[1];
    // Historical replacement/insertion tuples map to retained comment semantics.
    const annotationType = type === "D" ? AnnotationType.DELETION : AnnotationType.COMMENT;
    const text = type === "D" ? undefined : item[2];
    const author = type === "D" ? item[2] : item[3];
    const rawImages = type === "D" ? item[3] : item[4];
    const isQuickLabel = type === "C" && item[5] === 1;
    const choiceOptionLabel = type === "C" ? (choiceOptionLabels?.[index] ?? undefined) : undefined;
    const choiceAnnotationId =
      choiceOptionLabel !== undefined
        ? `ann-choice-shared-${index}-${Date.now()}`
        : `shared-${index}-${Date.now()}`;

    const annotation: Annotation = {
      id: choiceAnnotationId,
      blockId: "", // Will be populated during highlight restoration
      startOffset: 0,
      endOffset: 0,
      type: annotationType,
      text: text || undefined,
      originalText,
      createdA: Date.now() + index, // Preserve order
      author: author || undefined,
      images: parseShareableImages(rawImages),
      // startMeta/endMeta will be set by web-highlighter
    };
    if (isQuickLabel) annotation.isQuickLabel = true;
    if (choiceOptionLabel !== undefined) annotation.choiceOptionLabel = choiceOptionLabel;
    const diffContext = diffContexts?.[index];
    if (diffContext && isDiffContext(diffContext)) {
      annotation.diffContext = diffContext;
    }
    if (sources?.[index]) annotation.source = sources[index];
    if (choiceValidationEvidence?.[index]) {
      annotation.choiceValidationEvidence = choiceValidationEvidence[index];
    }
    return annotation;
  });
}

function buildDiffContextArray(annotations: readonly Annotation[]): SharePayload["d"] | null {
  const values = annotations.map((annotation) => annotation.diffContext ?? null);
  return values.some((value) => value !== null) ? values : null;
}

function buildSourceArray(annotations: readonly Annotation[]): SharePayload["s"] | null {
  const values = annotations.map((annotation) => annotation.source ?? null);
  return values.some((value) => value !== null) ? values : null;
}

function buildChoiceValidationEvidenceArray(
  annotations: readonly Annotation[],
): SharePayload["cv"] | null {
  const values = annotations.map((annotation) => annotation.choiceValidationEvidence ?? null);
  return values.some((value) => value !== null) ? values : null;
}

function buildChoiceOptionLabelArray(
  annotations: readonly Annotation[],
): SharePayload["co"] | null {
  const values = annotations.map((annotation) => annotation.choiceOptionLabel ?? null);
  return values.some((value) => value !== null) ? values : null;
}

function buildSharePayload(
  markdown: string,
  annotations: readonly Annotation[],
  globalAttachments: readonly ImageAttachment[] | undefined,
  rawHtml?: string,
): SharePayload {
  return {
    p: markdown,
    a: toShareable(annotations),
    g: globalAttachments?.length ? toShareableImages(globalAttachments) : undefined,
    d: buildDiffContextArray(annotations) ?? undefined,
    s: buildSourceArray(annotations) ?? undefined,
    cv: buildChoiceValidationEvidenceArray(annotations) ?? undefined,
    co: buildChoiceOptionLabelArray(annotations) ?? undefined,
    h: rawHtml,
    r: rawHtml ? "html" : undefined,
  };
}

/**
 * Generate a full shareable URL from plan and annotations
 */
export async function generateShareUrl(
  markdown: string,
  annotations: Annotation[],
  globalAttachments?: ImageAttachment[],
  baseUrl: string = DEFAULT_SHARE_BASE,
  rawHtml?: string,
): Promise<string | null> {
  // HTML content is too large for URL hashes — force paste service path
  if (rawHtml) return null;
  const payload = buildSharePayload(markdown, annotations, globalAttachments);
  const hash = await compress(payload);
  return `${baseUrl}/#${hash}`;
}

/**
 * Parse a share URL hash and return the payload
 * Returns null if no valid hash or parsing fails
 */
export async function parseShareHash(): Promise<SharePayload | null> {
  const raw = window.location.hash.slice(1); // Remove leading #
  const hash = raw.split("?")[0]; // Strip callback params (?cb=...&ct=...)

  if (!hash) {
    return null;
  }

  try {
    return decodeSharePayload(await decompress(hash));
  } catch (e) {
    console.warn("Failed to parse share hash:", e);
    return null;
  }
}

/**
 * Get the size of a URL in a human-readable format
 */
export function formatUrlSize(url: string): string {
  const bytes = new Blob([url]).size;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ---------------------------------------------------------------------------
// Short URL support (paste-service backed)
// ---------------------------------------------------------------------------

const DEFAULT_PASTE_API = "https://plannotator-paste.plannotator.workers.dev";
const DEFAULT_SHARE_BASE = "https://share.plannotator.ai";

function decodePasteApiUrl(value: string): string | null {
  const decoded = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(value));
  if (decoded === undefined) return null;

  try {
    const { protocol } = new URL(decoded);
    return protocol === "http:" || protocol === "https:" ? decoded : null;
  } catch {
    return null;
  }
}

export class ShortShareUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShortShareUrlError";
  }
}

/**
 * Create a short share URL by posting compressed plan data to the paste service.
 *
 * Returns `{ shortUrl, id }` on success, or `null` when the paste service is
 * unavailable (e.g. self-hosted environments without a paste backend). Callers
 * should fall back to the hash-based URL in that case.
 *
 * The request has a 5-second timeout so UI responsiveness is not affected.
 */
export async function createShortShareUrl(
  markdown: string,
  annotations: Annotation[],
  globalAttachments?: ImageAttachment[],
  options?: {
    /** Override the paste API base URL (default: https://plannotator-paste.plannotator.workers.dev) */
    pasteApiUrl?: string;
    /** Override the share site base URL used in the returned short link */
    shareBaseUrl?: string;
  },
  rawHtml?: string,
): Promise<{ shortUrl: string; id: string } | null> {
  const pasteApi = decodePasteApiUrl(options?.pasteApiUrl ?? DEFAULT_PASTE_API);
  const shareBase = options?.shareBaseUrl ?? DEFAULT_SHARE_BASE;
  if (pasteApi === null) return null;

  try {
    const payload = buildSharePayload(markdown, annotations, globalAttachments, rawHtml);
    const compressed = await compress(payload);

    // Encrypt before uploading — server only sees ciphertext
    const { ciphertext, key } = await encrypt(compressed);

    const response = await fetch(`${pasteApi}/api/paste`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: ciphertext }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      if (response.status === 413) {
        throw new ShortShareUrlError(await readPasteError(response, "Share payload is too large"));
      }
      console.warn(`[sharing] Paste service returned ${response.status}`);
      return null;
    }

    const rawResult: unknown = await response.json();
    const decodedResult = Schema.decodeUnknownOption(Schema.Struct({ id: Schema.String }))(
      rawResult,
    );
    if (Option.isNone(decodedResult)) return null;
    const result = decodedResult.value;
    // Embed paste origin in fragment when non-default so the share portal can
    // fetch from the right service without a server.
    const pasteParam =
      pasteApi !== DEFAULT_PASTE_API
        ? `&paste=${btoa(pasteApi).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")}`
        : "";
    const shortUrl = `${shareBase}/p/${result.id}#key=${key}${pasteParam}`;

    return { shortUrl, id: result.id };
  } catch (e) {
    if (e instanceof ShortShareUrlError) {
      throw e;
    }
    // Service unavailable — expected for self-hosted setups without a paste backend.
    // The caller is responsible for falling back to hash-based sharing silently.
    console.debug("[sharing] Short URL service unavailable, using hash-based sharing:", e);
    return null;
  }
}

async function readPasteError(response: Response, fallback: string): Promise<string> {
  try {
    const rawBody: unknown = await response.json();
    const decodedBody = Schema.decodeUnknownOption(
      Schema.Struct({ error: Schema.optional(Schema.Unknown) }),
    )(rawBody);
    const errorValue = Option.isSome(decodedBody) ? decodedBody.value.error : undefined;
    const errorString = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(errorValue),
    );
    return errorString !== undefined && errorString.trim() ? errorString : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Load plan data from a paste service using the paste ID embedded in a short URL.
 *
 * Fetches the compressed payload from `<pasteApiUrl>/api/paste/<pasteId>` and
 * decompresses it into a `SharePayload`. Returns `null` on any failure.
 */
export async function loadFromPasteId(
  pasteId: string,
  pasteApiUrl: string = DEFAULT_PASTE_API,
  encryptionKey?: string,
): Promise<SharePayload | null> {
  const pasteApi = decodePasteApiUrl(pasteApiUrl);
  if (pasteApi === null) return null;

  try {
    const response = await fetch(`${pasteApi}/api/paste/${pasteId}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[sharing] Paste fetch returned ${response.status} for id ${pasteId}`);
      return null;
    }

    const rawResult2: unknown = await response.json();
    const decodedResult2 = Schema.decodeUnknownOption(Schema.Struct({ data: Schema.String }))(
      rawResult2,
    );
    if (Option.isNone(decodedResult2)) return null;
    const result = decodedResult2.value;

    if (encryptionKey) {
      // Encrypted path: decrypt ciphertext, then decompress
      const compressed = await decrypt(result.data, encryptionKey);
      return decodeSharePayload(await decompress(compressed));
    }

    // Legacy unencrypted path: decompress directly
    return decodeSharePayload(await decompress(result.data));
  } catch (e) {
    console.warn("[sharing] Failed to load from paste ID:", e);
    return null;
  }
}
