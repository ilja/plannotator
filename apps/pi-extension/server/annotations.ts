/**
 * Editor annotation handler (in-memory store for VS Code integration).
 * EditorAnnotation type, createEditorAnnotationHandler
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { Option, Schema } from "effect";
import { EditorAnnotationRequestSchema } from "./request-schemas.js";
import { json, parseBody } from "./helpers";

interface EditorAnnotation {
  id: string;
  filePath: string;
  selectedText: string;
  lineStart: number;
  lineEnd: number;
  comment?: string;
  createdAt: number;
}

const decodeEditorAnnotationRequest = Schema.decodeUnknownOption(EditorAnnotationRequestSchema);
const decodeRecord = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown));
const decodeString = Schema.decodeUnknownOption(Schema.String);

export function createEditorAnnotationHandler() {
  const annotations: EditorAnnotation[] = [];

  return {
    async handle(
      req: IncomingMessage,
      res: import("node:http").ServerResponse,
      url: URL,
    ): Promise<boolean> {
      if (url.pathname === "/api/editor-annotations" && req.method === "GET") {
        json(res, { annotations });
        return true;
      }

      if (url.pathname === "/api/editor-annotation" && req.method === "POST") {
        try {
          const body = await parseBody(req);
          const decoded = Option.getOrUndefined(decodeEditorAnnotationRequest(body));
          if (
            !decoded ||
            !decoded.filePath ||
            !decoded.selectedText ||
            !decoded.lineStart ||
            !decoded.lineEnd
          ) {
            json(res, { error: "Missing required fields" }, 400);
            return true;
          }

          const record = Option.getOrUndefined(decodeRecord(body));
          const comment = record ? Option.getOrUndefined(decodeString(record.comment)) : undefined;
          const annotation: EditorAnnotation = {
            id: randomUUID(),
            filePath: decoded.filePath,
            selectedText: decoded.selectedText,
            lineStart: decoded.lineStart,
            lineEnd: decoded.lineEnd,
            ...(comment !== undefined && { comment }),
            createdAt: Date.now(),
          };

          annotations.push(annotation);
          json(res, { id: annotation.id });
        } catch {
          json(res, { error: "Invalid JSON" }, 400);
        }
        return true;
      }

      if (url.pathname === "/api/editor-annotation" && req.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) {
          json(res, { error: "Missing id parameter" }, 400);
          return true;
        }
        const idx = annotations.findIndex((annotation) => annotation.id === id);
        if (idx !== -1) {
          annotations.splice(idx, 1);
        }
        json(res, { ok: true });
        return true;
      }

      return false;
    },
  };
}
