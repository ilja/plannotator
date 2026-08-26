/**
 * Server-side share URL generation for remote sessions
 *
 * Generates a share.plannotator.ai URL from plan content so remote users
 * can open the review in their local browser without port forwarding.
 */

import { Option, Schema } from "effect";
import { compress, type JsonValue } from "@plannotator/shared/compress";
import { encrypt } from "@plannotator/shared/crypto";

const DEFAULT_SHARE_BASE = "https://share.plannotator.ai";
const DEFAULT_PASTE_API = "https://plannotator-paste.plannotator.workers.dev";

export type RemoteShareFetch = typeof fetch;

export interface RemoteShareOptions {
  rawHtml?: string;
  pasteApiUrl?: string;
  fetchImpl?: RemoteShareFetch;
}

interface RemotePasteHtmlPayload {
  p: string;
  a: JsonValue[];
  h: string;
  r: "html";
}

const PasteSuccessResponseSchema = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
});

const PasteErrorResponseSchema = Schema.Struct({
  error: Schema.optionalKey(Schema.String),
});

/**
 * Generate a share URL from plan markdown content.
 *
 * Returns the full hash-based URL. For remote sessions, this lets the
 * user open the plan in their local browser without any backend needed.
 */
export async function generateRemoteShareUrl(
  plan: string,
  shareBaseUrl?: string,
  options: RemoteShareOptions = {},
): Promise<string> {
  const base = shareBaseUrl || DEFAULT_SHARE_BASE;
  if (options.rawHtml) {
    // Callers that start from a local file should pass self-contained HTML
    // so sibling assets keep working after the payload leaves the machine.
    return generateRemotePasteShareUrl(
      { p: plan, a: [], h: options.rawHtml, r: "html" },
      base,
      options.pasteApiUrl,
      options.fetchImpl,
    );
  }
  const hash = await compress({ p: plan, a: [] });
  return `${base}/#${hash}`;
}

async function generateRemotePasteShareUrl(
  payload: RemotePasteHtmlPayload,
  shareBaseUrl: string,
  pasteApiUrl = DEFAULT_PASTE_API,
  fetchImpl: RemoteShareFetch = fetch,
): Promise<string> {
  const compressed = await compress(payload);
  const { ciphertext, key } = await encrypt(compressed);

  const response = await fetchImpl(`${pasteApiUrl}/api/paste`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: ciphertext }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(await readPasteError(response, `Paste service returned ${response.status}`));
  }

  const rawResult = await response.json();
  const decodedResult = Option.getOrUndefined(
    Schema.decodeUnknownOption(PasteSuccessResponseSchema)(rawResult),
  );
  const resultId = decodedResult?.id;
  if (!resultId) {
    throw new Error("Paste service response missing id");
  }

  const pasteParam =
    pasteApiUrl !== DEFAULT_PASTE_API ? `&paste=${base64UrlEncode(pasteApiUrl)}` : "";
  return `${shareBaseUrl}/p/${resultId}#key=${key}${pasteParam}`;
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function readPasteError(response: Response, fallback: string): Promise<string> {
  try {
    const rawBody = await response.json();
    const decoded = Option.getOrUndefined(
      Schema.decodeUnknownOption(PasteErrorResponseSchema)(rawBody),
    );
    const errorMessage = decoded?.error;
    return errorMessage?.trim() ? errorMessage : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Format byte size as human-readable string
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 100 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
}

/**
 * Generate a remote share URL and write it to stderr for the user.
 * Keeps the local server running, but warns when the fallback share link
 * cannot be created for remote sessions.
 */
export async function writeRemoteShareLink(
  content: string,
  shareBaseUrl: string | undefined,
  verb: string,
  noun: string,
  options: RemoteShareOptions = {},
): Promise<void> {
  try {
    const shareUrl = await generateRemoteShareUrl(content, shareBaseUrl, options);
    const size = formatSize(new TextEncoder().encode(shareUrl).length);
    process.stderr.write(
      `\n  Open this link on your local machine to ${verb}:\n` +
        `  ${shareUrl}\n\n` +
        `  (${size} — ${noun}, annotations added in browser)\n\n`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const pasteHint = options.rawHtml
      ? " HTML sharing uses the paste service; check PLANNOTATOR_PASTE_URL or try a smaller/self-contained HTML file."
      : "";
    process.stderr.write(
      `\n  Warning: could not create remote share link for ${noun}.\n` +
        `  ${reason}.${pasteHint}\n\n`,
    );
  }
}
