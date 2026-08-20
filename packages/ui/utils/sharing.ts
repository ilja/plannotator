/**
 * Portable sharing utilities for Plannotator
 *
 * Enables sharing plan + annotations via URL hash using:
 * - Native CompressionStream/DecompressionStream (deflate-raw)
 * - Base64url encoding for URL safety
 *
 * Inspired by textarea.my's approach.
 */

import { Annotation, AnnotationType, type ChoiceValidationEvidence, type ImageAttachment } from '../types';
import { compress, decompress } from '@plannotator/shared/compress';
import { encrypt, decrypt } from '@plannotator/shared/crypto';

// Image in shareable format: plain string (old) or [path, name] tuple (new)
type ShareableImage = string | [string, string];

// Minimal shareable annotation format: [type, originalText, text?, author?, images?, quickLabel?]
export type ShareableAnnotation =
  | ['D', string, string | null, ShareableImage[]?]                    // Deletion: type, original, author, images
  | ['C', string, string, string | null, ShareableImage[]?, (1)?]      // Comment: type, original, comment, author, images, isQuickLabel
  | ['G', string, string | null, ShareableImage[]?];                   // Global Comment: type, comment, author, images

export interface SharePayload {
  p: string;  // plan markdown
  a: ShareableAnnotation[];
  g?: ShareableImage[];  // global attachments (path strings or [path, name] tuples)
  d?: (string | null)[];  // diffContext per annotation, parallel to `a`
  s?: (string | undefined)[];  // source per annotation (external tool identifier), parallel to `a`
  cv?: (ChoiceValidationEvidence | null)[];  // choice evidence per annotation, parallel to `a`
  co?: (string | null)[];  // selected choice label per annotation, parallel to `a`
  h?: string;  // raw HTML content (direct HTML rendering mode)
  r?: 'html';  // render mode flag (omitted = markdown)
}

interface TypeMap {
  [key: string]: AnnotationType;
}

/**
 * Convert ShareableImage[] to ImageAttachment[] (handles old plain-string format)
 */
export function parseShareableImages(raw: ShareableImage[] | undefined): ImageAttachment[] | undefined {
  if (!raw?.length) return undefined;
  return raw.map(img => {
    if (Object.prototype.toString.call(img) === "[object String]") {
      // Old format: plain path string — derive name from filename
      const name = img.split('/').pop()?.replace(/\.[^.]+$/, '') || 'image';
      return { path: img, name };
    }
    return { path: img[0], name: img[1] };
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
      // SAFETY: ShareableAnnotation is a discriminated tuple — cast to the union type
      return ['G', ann.text || '', author, images] as ShareableAnnotation;
    }

    if (ann.type === AnnotationType.DELETION) {
      // SAFETY: ShareableAnnotation is a discriminated tuple — cast to the union type
      return ['D', ann.originalText, author, images] as ShareableAnnotation;
    }

    // COMMENT
    if (ann.isQuickLabel) {
      // SAFETY: ShareableAnnotation is a discriminated tuple — cast to the union type
      return ['C', ann.originalText, ann.text || '', author, images ?? undefined, 1] as ShareableAnnotation;
    }
    // SAFETY: ShareableAnnotation is a discriminated tuple — cast to the union type
    return ['C', ann.originalText, ann.text || '', author, images] as ShareableAnnotation;
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
      // SAFETY: ShareableAnnotation G payload is [string] at index 1 — cast to string
      const text = item[1] as string;
      // SAFETY: ShareableAnnotation G payload is string | null at index 2 — cast to string | null
      const author = item[2] as string | null;
      // SAFETY: ShareableAnnotation G payload is ShareableImage[] at index 3 — cast to ShareableImage[] | undefined
      const rawImages = item[3] as ShareableImage[] | undefined;

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
    // SAFETY: ShareableAnnotation text is string at index 2 for non-D — cast to string
    const text = type === 'D' ? undefined : item[2] as string;
    // SAFETY: ShareableAnnotation author is string | null at index 2/3 — cast to string | null
    const author = type === 'D' ? item[2] as string | null : item[3] as string | null;
    // SAFETY: ShareableAnnotation images is ShareableImage[] at index 3/4 — cast to ShareableImage[] | undefined
    const rawImages = type === 'D' ? item[3] as ShareableImage[] | undefined : item[4] as ShareableImage[] | undefined;
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
    // SAFETY: decompress hash is known SharePayload from compress — cast to SharePayload
    return (await decompress(hash)) as SharePayload;
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

    // SAFETY: paste service returns { id: string } — cast to expected shape
    const result = (await response.json()) as { id: string };
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
    // SAFETY: error response is { error?: unknown } — cast to expected shape
    const body = (await response.json()) as { error?: unknown };
    // SAFETY: body.error is string after Object.prototype check — cast to string
    return Object.prototype.toString.call(body.error) === "[object String]" && (body.error as string).trim() ? (body.error as string) : fallback;
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

    // SAFETY: paste service returns { data: string } — cast to expected shape
    const result = (await response.json()) as { data: string };

    if (encryptionKey) {
      // Encrypted path: decrypt ciphertext, then decompress
      const compressed = await decrypt(result.data, encryptionKey);
      // SAFETY: decompressed payload is known SharePayload — cast to SharePayload
      return await decompress(compressed) as SharePayload;
    }

    // Legacy unencrypted path: decompress directly
    // SAFETY: decompressed payload is known SharePayload — cast to SharePayload
    return await decompress(result.data) as SharePayload;
  } catch (e) {
    console.warn('[sharing] Failed to load from paste ID:', e);
    return null;
  }
}
