/**
 * Editor Annotations — ephemeral in-memory store for VS Code editor selections.
 *
 * The VS Code extension POSTs annotations from the editor; the webview app
 * polls to pick them up. The array lives in this closure and dies when the
 * server stops. No disk persistence.
 */

import { Option, Schema } from "effect";
import { malformedJsonBody, readJsonBody } from "./request-body";
import type { EditorAnnotation } from "@plannotator/shared/types";

export type { EditorAnnotation };

export interface EditorAnnotationHandler {
  handle: (req: Request, url: URL) => Promise<Response | null>;
}

const EditorAnnotationRequestSchema = Schema.Struct({
  filePath: Schema.String,
  selectedText: Schema.String,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
});

const decodeEditorAnnotationRequest = Schema.decodeUnknownOption(EditorAnnotationRequestSchema);

const decodeRecord = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown));

const decodeString = Schema.decodeUnknownOption(Schema.String);

export function createEditorAnnotationHandler(): EditorAnnotationHandler {
  const annotations: EditorAnnotation[] = [];

  return {
    async handle(req: Request, url: URL): Promise<Response | null> {
      // GET /api/editor-annotations — return all
      if (url.pathname === "/api/editor-annotations" && req.method === "GET") {
        return Response.json({ annotations });
      }

      // POST /api/editor-annotation — add one
      if (url.pathname === "/api/editor-annotation" && req.method === "POST") {
        try {
          const parsedBody = await readJsonBody(req);

          if (!parsedBody.ok) return malformedJsonBody();

          const body = parsedBody.value;
          const decoded = Option.getOrUndefined(decodeEditorAnnotationRequest(body));

          if (
            !decoded ||
            !decoded.filePath ||
            !decoded.selectedText ||
            !decoded.lineStart ||
            !decoded.lineEnd
          ) {
            return Response.json({ error: "Missing required fields" }, { status: 400 });
          }

          const record = Option.getOrUndefined(decodeRecord(body));
          const comment = record ? Option.getOrUndefined(decodeString(record.comment)) : undefined;

          const annotation: EditorAnnotation = {
            id: crypto.randomUUID(),
            filePath: decoded.filePath,
            selectedText: decoded.selectedText,
            lineStart: decoded.lineStart,
            lineEnd: decoded.lineEnd,
            ...(comment !== undefined && { comment }),
            createdAt: Date.now(),
          };

          annotations.push(annotation);

          return Response.json({ id: annotation.id });
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
      }

      // DELETE /api/editor-annotation?id=xxx — remove one
      if (url.pathname === "/api/editor-annotation" && req.method === "DELETE") {
        const id = url.searchParams.get("id");

        if (!id) {
          return Response.json({ error: "Missing id parameter" }, { status: 400 });
        }

        const idx = annotations.findIndex((a) => a.id === id);

        if (idx !== -1) {
          annotations.splice(idx, 1);
        }

        return Response.json({ ok: true });
      }

      // Not handled
      return null;
    },
  };
}
