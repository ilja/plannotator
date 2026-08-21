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
import { Annotation, AnnotationType, type ChoiceValidationEvidence, type ImageAttachment } from '../types';
import { compress, decompress } from '@plannotator/shared/compress';
import { encrypt, decrypt } from '@plannotator/shared/crypto';

// Image in shareable format: plain string (old) or [path, name] tuple (new)
type ShareableImage = string | [string, string];
const ShareableImageSchema = Schema.Union([Schema.String, Schema.Tuple([Schema.String, Schema.String])]);

export type ShareableAnnotation =
  | ['D', string, string | null, ShareableImage[]?]
  | ['C', string, string, string | null, ShareableImage[]?, (1)?]
  | ['G', string, string | null, ShareableImage[]?];

const ShareableAnnotationSchema = Schema.Union([
  Schema.Tuple([Schema.Literal("D"), Schema.String, Schema.NullOr(Schema.String), Schema.optional(Schema.NullOr(Schema.Array(ShareableImageSchema)))]),
  Schema.Tuple([Schema.Literal("C"), Schema.String, Schema.String, Schema.NullOr(Schema.String), Schema.optional(Schema.NullOr(Schema.Array(ShareableImageSchema))), Schema.optional(Schema.Literal(1))]),
  Schema.Tuple([Schema.Literal("G"), Schema.String, Schema.NullOr(Schema.String), Schema.optional(Schema.NullOr(Schema.Array(ShareableImageSchema)))])
]);

export interface SharePayload {
  p: string;
  a: ShareableAnnotation[];
  g?: ShareableImage[];
  d?: (string | null)[];
  s?: (string | undefined)[];
  cv?: (ChoiceValidationEvidence | null)[];
  co?: (string | null)[];
  h?: string;
  r?: 'html';
}

const SharePayloadSchema = Schema.Struct({
  p: Schema.String,
  a: Schema.Array(ShareableAnnotationSchema),
  g: Schema.optional(Schema.Array(ShareableImageSchema)),
  d: Schema.optional(Schema.Array(Schema.NullOr(Schema.String))),
  s: Schema.optional(Schema.Array(Schema.UndefinedOr(Schema.String))),
  cv: Schema.optional(Schema.Array(Schema.NullOr(Schema.Unknown))),
  co: Schema.optional(Schema.Array(Schema.NullOr(Schema.String))),
  h: Schema.optional(Schema.String),
  r: Schema.optional(Schema.Literal("html")),
});

interface TypeMap {
  [key: string]: AnnotationType;
}

/**
 * Convert ShareableImage[] to ImageAttachment[] (handles old plain-string format)
 */
export function parseShareableImages(raw: ShareableImage[] | undefined): ImageAttachment[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map(img => {
    if (Array.isArray(img)) {
      return { path: img[0], name: img[1] };
    }
    const name = img.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
    return { path: img, name };
  });
}

/**
 * Convert ImageAttachment[] to ShareableImage[] for compact serialization
 */
export function toShareableImages(images: ImageAttachment[] | undefined): ShareableImage[] | undefined {
  if (!images?.length) return undefined;
  return images.map(img => [img.path, img.name]);
}

// Re-export compress/decompress from shared package (single source of truth)
export { compress, decompress };

/**
 * Convert full Annotation objects to minimal shareable format
 */
export function toShareable(annotations: Annotation[]): ShareableAnnotation[] {
  return annotations.map(ann => {
    const author = ann.author || null;
    const images = toShareableImages(ann.images);

    // Handle GLOBAL_COMMENT specially - it starts with 'G' (from GLOBAL_COMMENT)
    if (ann.type === AnnotationType.GLOBAL_COMMENT) {
      return ['G', ann.text || '', author, images] satisfies ShareableAnnotation;
    }

    if (ann.type === AnnotationType.DELETION) {
      return ['D', ann.originalText, author, images] satisfies ShareableAnnotation;
    }

    // COMMENT
    if (ann.isQuickLabel) {
      return ['C', ann.originalText, ann.text || '', author, images ?? undefined, 1] satisfies ShareableAnnotation;
    }
    return ['C', ann.originalText, ann.text || '', author, images] satisfies ShareableAnnotation;
  });
}

/**
 * Convert shareable format back to full Annotation objects
 * Note: blockId, offsets, and meta will need to be populated separately
 * by finding the text in the rendered document.
 */
export function fromShareable(
  data: ShareableAnnotation[],
  diffContexts?: (string | null)[] | null,
  sources?: (string | undefined)[] | null,
  choiceValidationEvidence?: (ChoiceValidationEvidence | null)[] | null,
  choiceOptionLabels?: (string | null)[] | null,
): Annotation[] {
  const typeMap: TypeMap = {
    'D': AnnotationType.DELETION,
    'C': AnnotationType.COMMENT,
    'G': AnnotationType.GLOBAL_COMMENT,
  };

  return data.map((item, index) => {
    const type = item[0];

    // Handle global comments specially: ['G', text, author, images?]
    if (type === 'G') {
      const text = item[1];
      const author = item[2];
      const rawImages = item[3];

      const gAnnotation: Annotation = {
        id: `shared-${index}-${Date.now()}`,
        blockId: '',
        startOffset: 0,
        endOffset: 0,
        type: AnnotationType.GLOBAL_COMMENT,
        text: text || undefined,
        originalText: '',
        createdA: Date.now() + index,
        author: author || undefined,
        images: parseShareableImages(rawImages),
      };
      if (sources?.[index]) gAnnotation.source = sources[index]!;
      return gAnnotation;
    }

    const originalText = item[1];
    // For deletion: [type, original, author, images?]
    // For others: [type, original, text, author, images?]
    // SAFETY: ShareableAnnotation text is string at index 2 for C/G — cast to tuple type
    const text = type === 'D' ? undefined : (item as ['C', string, string, string | null, ShareableImage[]?, (1)?])[2];
    // SAFETY: ShareableAnnotation author at index 2/3 — cast to tuple type
    const author = type === 'D' ? (item as ['D', string, string | null, ShareableImage[]?])[2] : (item as ['C', string, string, string | null, ShareableImage[]?, (1)?])[3];
    // SAFETY: ShareableAnnotation images at index 3/4 — cast to tuple type
    const rawImages = type === 'D' ? (item as ['D', string, string | null, ShareableImage[]?])[3] : (item as ['C', string, string, string | null, ShareableImage[]?, (1)?])[4];
    // Comment annotations may have isQuickLabel flag at index 5
    const isQuickLabel = type === 'C' && item.length > 5 && item[5] === 1 ? true : undefined;
    const choiceOptionLabel = type === 'C' ? choiceOptionLabels?.[index] ?? undefined : undefined;
    const choiceAnnotationId = choiceOptionLabel !== undefined
      ? `ann-choice-shared-${index}-${Date.now()}`
      : `shared-${index}-${Date.now()}`;

    const annotation: Annotation = {
      id: choiceAnnotationId,
      blockId: '',  // Will be populated during highlight restoration
      startOffset: 0,
      endOffset: 0,
      type: typeMap[type],
      text: text || undefined,
      originalText,
      createdA: Date.now() + index,  // Preserve order
      author: author || undefined,
      images: parseShareableImages(rawImages),
      // startMeta/endMeta will be set by web-highlighter
    };
    if (isQuickLabel) annotation.isQuickLabel = true;
    if (choiceOptionLabel !== undefined) annotation.choiceOptionLabel = choiceOptionLabel;
    if (diffContexts?.[index]) {
      // SAFETY: diffContext value is known Annotation diffContext string — cast to diffContext type
      annotation.diffContext = diffContexts[index] as Annotation['diffContext'];
    }
    if (sources?.[index]) annotation.source = sources[index]!;
    if (choiceValidationEvidence?.[index]) annotation.choiceValidationEvidence = choiceValidationEvidence[index]!;
    return annotation;
  });
}

function buildDiffContextArray(annotations: Annotation[]): (string | null)[] | null {
  const arr = annotations.map(a => a.diffContext || null);
  return arr.some(v => v !== null) ? arr : null;
}

function buildSourceArray(annotations: Annotation[]): (string | undefined)[] | null {
  const arr = annotations.map(a => a.source || undefined);
  return arr.some(v => v !== undefined) ? arr : null;
}

function buildChoiceValidationEvidenceArray(annotations: Annotation[]): (ChoiceValidationEvidence | null)[] | null {
  const arr = annotations.map(annotation => annotation.choiceValidationEvidence ?? null);
  return arr.some(value => value !== null) ? arr : null;
}

function buildChoiceOptionLabelArray(annotations: Annotation[]): (string | null)[] | null {
  const arr = annotations.map(annotation => annotation.choiceOptionLabel ?? null);
  return arr.some(value => value !== null) ? arr : null;
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
  const diffContexts = buildDiffContextArray(annotations);
  const sources = buildSourceArray(annotations);
  const choiceValidationEvidence = buildChoiceValidationEvidenceArray(annotations);
  const choiceOptionLabels = buildChoiceOptionLabelArray(annotations);
  const payload: SharePayload = {
    p: markdown,
    a: toShareable(annotations),
    g: globalAttachments?.length ? toShareableImages(globalAttachments) : undefined,
  };
  if (diffContexts) payload.d = diffContexts;
  if (sources) payload.s = sources;
  if (choiceValidationEvidence) payload.cv = choiceValidationEvidence;
  if (choiceOptionLabels) payload.co = choiceOptionLabels;

  const hash = await compress(payload);
  return `${baseUrl}/#${hash}`;
}

/**
 * Parse a share URL hash and return the payload
 * Returns null if no valid hash or parsing fails
 */
export async function parseShareHash(): Promise<SharePayload | null> {
  const raw = window.location.hash.slice(1); // Remove leading #
  const hash = raw.split('?')[0]; // Strip callback params (?cb=...&ct=...)

  if (!hash) {
    return null;
  }

  try {
    const decompressed = await decompress(hash);
    const decoded = Schema.decodeUnknownOption(SharePayloadSchema)(decompressed);
    if (Option.isSome(decoded)) {
      // SAFETY: Schema array is readonly, SharePayload expects mutable — cast to mutable
      return decoded.value as SharePayload;
    }
    return null;
  } catch (e) {
    console.warn('Failed to parse share hash:', e);
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

const DEFAULT_PASTE_API = 'https://plannotator-paste.plannotator.workers.dev';
const DEFAULT_SHARE_BASE = 'https://share.plannotator.ai';

export class ShortShareUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShortShareUrlError';
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
  const pasteApi = options?.pasteApiUrl ?? DEFAULT_PASTE_API;
  const shareBase = options?.shareBaseUrl ?? DEFAULT_SHARE_BASE;

  try {
    const diffContexts = buildDiffContextArray(annotations);
    const sources = buildSourceArray(annotations);
    const choiceValidationEvidence = buildChoiceValidationEvidenceArray(annotations);
    const choiceOptionLabels = buildChoiceOptionLabelArray(annotations);
    const payload: SharePayload = {
      p: markdown,
      a: toShareable(annotations),
      g: globalAttachments?.length ? toShareableImages(globalAttachments) : undefined,
    };
    if (diffContexts) payload.d = diffContexts;
    if (sources) payload.s = sources;
    if (choiceValidationEvidence) payload.cv = choiceValidationEvidence;
    if (choiceOptionLabels) payload.co = choiceOptionLabels;
    if (rawHtml) {
      payload.h = rawHtml;
      payload.r = 'html';
    }

    const compressed = await compress(payload);

    // Encrypt before uploading — server only sees ciphertext
    const { ciphertext, key } = await encrypt(compressed);

    const response = await fetch(`${pasteApi}/api/paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: ciphertext }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      if (response.status === 413) {
        throw new ShortShareUrlError(await readPasteError(response, 'Share payload is too large'));
      }
      console.warn(`[sharing] Paste service returned ${response.status}`);
      return null;
    }

    const rawResult: unknown = await response.json();
    const decodedResult = Schema.decodeUnknownOption(Schema.Struct({ id: Schema.String }))(rawResult);
    if (Option.isNone(decodedResult)) return null;
    const result = decodedResult.value;
    // Embed paste origin in fragment when non-default so the share portal can
    // fetch from the right service without a server.
    const pasteParam = pasteApi !== DEFAULT_PASTE_API
      ? `&paste=${btoa(pasteApi).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}`
      : '';
    const shortUrl = `${shareBase}/p/${result.id}#key=${key}${pasteParam}`;

    return { shortUrl, id: result.id };
  } catch (e) {
    if (e instanceof ShortShareUrlError) {
      throw e;
    }
    // Service unavailable — expected for self-hosted setups without a paste backend.
    // The caller is responsible for falling back to hash-based sharing silently.
    console.debug('[sharing] Short URL service unavailable, using hash-based sharing:', e);
    return null;
  }
}

async function readPasteError(response: Response, fallback: string): Promise<string> {
  try {
    const rawBody: unknown = await response.json();
    const decodedBody = Schema.decodeUnknownOption(Schema.Struct({ error: Schema.optional(Schema.Unknown) }))(rawBody);
    const errorValue = Option.isSome(decodedBody) ? decodedBody.value.error : undefined;
    const errorString = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(errorValue));
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
  encryptionKey?: string
): Promise<SharePayload | null> {
  try {
    const response = await fetch(`${pasteApiUrl}/api/paste/${pasteId}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[sharing] Paste fetch returned ${response.status} for id ${pasteId}`);
      return null;
    }

    const rawResult2: unknown = await response.json();
    const decodedResult2 = Schema.decodeUnknownOption(Schema.Struct({ data: Schema.String }))(rawResult2);
    if (Option.isNone(decodedResult2)) return null;
    const result = decodedResult2.value;

    if (encryptionKey) {
      // Encrypted path: decrypt ciphertext, then decompress
      const compressed = await decrypt(result.data, encryptionKey);
      const decompressed2 = await decompress(compressed);
      const decoded2 = Schema.decodeUnknownOption(SharePayloadSchema)(decompressed2);
      if (Option.isSome(decoded2)) {
        // SAFETY: Schema array is readonly, SharePayload expects mutable — cast to mutable
        return decoded2.value as SharePayload;
      }
      return null;
    }

    // Legacy unencrypted path: decompress directly
    const decompressed3 = await decompress(result.data);
    const decoded3 = Schema.decodeUnknownOption(SharePayloadSchema)(decompressed3);
    if (Option.isSome(decoded3)) {
      // SAFETY: Schema array is readonly, SharePayload expects mutable — cast to mutable
      return decoded3.value as SharePayload;
    }
    return null;
  } catch (e) {
    console.warn('[sharing] Failed to load from paste ID:', e);
    return null;
  }
}
