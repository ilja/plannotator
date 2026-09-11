/**
 * External Annotations — Pi (node:http) server handler.
 *
 * Thin HTTP adapter over the shared annotation store. Mirrors the Bun
 * handler at packages/server/external-annotations.ts but uses node:http
 * IncomingMessage/ServerResponse + res.write() for SSE.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createAnnotationStore,
  transformPlanInput,
  transformReviewInput,
  serializeSSEEvent,
  HEARTBEAT_COMMENT,
  HEARTBEAT_INTERVAL_MS,
  type StorableAnnotation,
  type ExternalAnnotationEvent,
  decodeExternalAnnotationPatch,
} from "../generated/external-annotation.js";
import { json, parseBody, toWebRequest, type ParsedRequestBody } from "./helpers.js";

// ---------------------------------------------------------------------------
// Route prefix
// ---------------------------------------------------------------------------

const BASE = "/api/external-annotations";

const STREAM = `${BASE}/stream`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createExternalAnnotationHandler(mode: "plan" | "review") {
  const store = createAnnotationStore<StorableAnnotation>();
  const subscribers = new Set<ServerResponse>();
  const transform = mode === "plan" ? transformPlanInput : transformReviewInput;

  function broadcastMutation(event: ExternalAnnotationEvent<StorableAnnotation>): void {
    const data = serializeSSEEvent(event);

    for (const res of subscribers) {
      try {
        res.write(data);
      } catch {
        subscribers.delete(res);
      }
    }
  }

  function addAnnotations(body: ParsedRequestBody): { ids: string[] } | { error: string } {
    const parsed = transform(body);

    if ("error" in parsed) return { error: parsed.error };
    const created = store.add(parsed.annotations);

    return { ids: created.map((annotation: StorableAnnotation) => annotation.id) };
  }

  function handleStreamRequest(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.setTimeout(0);
    res.write(
      serializeSSEEvent({
        type: "snapshot",
        annotations: store.getAll(),
      }),
    );
    subscribers.add(res);

    const heartbeatTimer = setInterval(() => {
      try {
        res.write(HEARTBEAT_COMMENT);
      } catch {
        clearInterval(heartbeatTimer);
        subscribers.delete(res);
      }
    }, HEARTBEAT_INTERVAL_MS);

    res.on("close", () => {
      clearInterval(heartbeatTimer);
      subscribers.delete(res);
    });
  }

  function handleSnapshotRequest(res: ServerResponse, url: URL): void {
    const since = url.searchParams.get("since");

    if (since !== null) {
      const sinceVersion = parseInt(since, 10);

      if (!isNaN(sinceVersion) && sinceVersion === store.version) {
        res.writeHead(304);
        res.end();

        return;
      }
    }

    json(res, {
      annotations: store.getAll(),
      version: store.version,
    });
  }

  async function handleAddRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const result = addAnnotations(await parseBody(req));

      if ("error" in result) {
        json(res, { error: result.error }, 400);

        return;
      }

      json(res, result, 201);
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
    }
  }

  async function handlePatchRequest(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const id = url.searchParams.get("id");

    if (!id) {
      json(res, { error: "Missing ?id parameter" }, 400);

      return;
    }

    try {
      const patch = decodeExternalAnnotationPatch(mode, await toWebRequest(req).json());

      if (!patch) {
        json(res, { error: "Invalid JSON" }, 400);

        return;
      }

      const updated = store.update(id, patch);

      if (!updated) {
        json(res, { error: "Not found" }, 404);

        return;
      }

      json(res, { annotation: updated });
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
    }
  }

  function handleDeleteRequest(res: ServerResponse, url: URL): void {
    const id = url.searchParams.get("id");

    if (id) {
      store.remove(id);
      json(res, { ok: true });

      return;
    }

    const source = url.searchParams.get("source");

    if (source) {
      json(res, { ok: true, removed: store.clearBySource(source) });

      return;
    }

    json(res, { ok: true, removed: store.clearAll() });
  }

  store.onMutation(broadcastMutation);

  return {
    /** Push annotations directly into the store (bypasses HTTP, reuses same validation). */
    addAnnotations,

    async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
      if (url.pathname === STREAM && req.method === "GET") {
        handleStreamRequest(res);

        return true;
      }

      if (url.pathname === BASE && req.method === "GET") {
        handleSnapshotRequest(res, url);

        return true;
      }

      if (url.pathname === BASE && req.method === "POST") {
        await handleAddRequest(req, res);

        return true;
      }

      if (url.pathname === BASE && req.method === "PATCH") {
        await handlePatchRequest(req, res, url);

        return true;
      }

      if (url.pathname === BASE && req.method === "DELETE") {
        handleDeleteRequest(res, url);

        return true;
      }

      return false;
    },
  };
}
