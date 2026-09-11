/**
 * Core HTTP helpers for Pi extension servers.
 * parseBody, json, html, send, toWebRequest
 */

import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { Option, Schema } from "effect";

/**
 * Parsed JSON request body before endpoint-level schema decoding.
 * `JSON.parse` yields arbitrary objects; every handler that consumes fields
 * decodes this into a typed request schema at its boundary.
 */
const ParsedRequestBodySchema = Schema.Record(Schema.String, Schema.Unknown);

export type ParsedRequestBody = Schema.Schema.Type<typeof ParsedRequestBodySchema>;

/** Parse a JSON request body and return null for malformed or non-object payloads. */
export function parseStrictRequestBody(rawBody: string): ParsedRequestBody | null {
  try {
    return (
      Option.getOrUndefined(
        Schema.decodeUnknownOption(ParsedRequestBodySchema)(JSON.parse(rawBody)),
      ) ?? null
    );
  } catch {
    return null;
  }
}

/** Parse a JSON request body and normalize non-object payloads to an empty object. */
export function parseRequestBody(rawBody: string): ParsedRequestBody {
  return parseStrictRequestBody(rawBody) ?? {};
}

export function parseBody(req: IncomingMessage): Promise<ParsedRequestBody> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => resolve(parseRequestBody(data)));
  });
}

export function parseStrictBody(req: IncomingMessage): Promise<ParsedRequestBody | null> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: string) => (data += chunk));
    req.on("end", () => resolve(parseStrictRequestBody(data)));
  });
}

export function json<T>(res: import("node:http").ServerResponse, data: T, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function html(res: import("node:http").ServerResponse, content: string): void {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(content);
}

export function send(
  res: import("node:http").ServerResponse,
  body: string | Buffer,
  status = 200,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, headers);
  res.end(body);
}

export function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://localhost");
}

export function toWebRequest(req: IncomingMessage): Request {
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    // SAFETY: `Readable.toWeb` returns the node:stream/web ReadableStream,
    // which is structurally the WHATWG ReadableStream that BodyInit wraps;
    // the cast bridges the duplicated lib definitions, not a value mismatch.
    init.body = Readable.toWeb(req) as BodyInit;
    init.duplex = "half";
  }

  return new Request(`http://localhost${req.url ?? "/"}`, init);
}
