import { describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { createEditorAnnotationHandler } from "./editor-annotations";

type JsonValue = Schema.Schema.Type<typeof Schema.Json>;
const decodeJson = Schema.decodeUnknownSync(Schema.Json);

const endpoint = "http://localhost";

async function handlePost(handler: ReturnType<typeof createEditorAnnotationHandler>, body: string): Promise<Response> {
  return handler.handle(
    new Request(`${endpoint}/api/editor-annotation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
    new URL(`${endpoint}/api/editor-annotation`),
  );
}

async function responseJson(response: Response): Promise<JsonValue> {
  return decodeJson(await response.json());
}

describe("editor annotation handler", () => {
  test("accepts valid requests, including negative and fractional line numbers, and round-trips through GET", async () => {
    const handler = createEditorAnnotationHandler();
    const response = await handlePost(handler, JSON.stringify({
      filePath: "src/example.ts",
      selectedText: "const value = 1;",
      lineStart: -1.5,
      lineEnd: 2.5,
      comment: "Review this",
    }));

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ id: expect.any(String) });

    const getResponse = await handler.handle(
      new Request(`${endpoint}/api/editor-annotations`),
      new URL(`${endpoint}/api/editor-annotations`),
    );
    expect(await responseJson(getResponse!)).toEqual({
      annotations: [{
        id: expect.any(String),
        filePath: "src/example.ts",
        selectedText: "const value = 1;",
        lineStart: -1.5,
        lineEnd: 2.5,
        comment: "Review this",
        createdAt: expect.any(Number),
      }],
    });
  });

  test("rejects invalid JSON and missing or wrongly typed required fields", async () => {
    const handler = createEditorAnnotationHandler();
    const invalidJson = await handlePost(handler, "{invalid-json");
    expect(invalidJson.status).toBe(400);
    expect(await responseJson(invalidJson)).toEqual({ error: "Invalid JSON" });

    for (const body of [
      {},
      { filePath: "", selectedText: "text", lineStart: 1, lineEnd: 1 },
      { filePath: "src/a.ts", selectedText: "", lineStart: 1, lineEnd: 1 },
      { filePath: "src/a.ts", selectedText: "text", lineStart: 0, lineEnd: 1 },
      { filePath: "src/a.ts", selectedText: "text", lineStart: 1, lineEnd: 0 },
      { filePath: 42, selectedText: "text", lineStart: 1, lineEnd: 1 },
      { filePath: "src/a.ts", selectedText: "text", lineStart: "1", lineEnd: 1 },
    ]) {
      const response = await handlePost(handler, JSON.stringify(body));
      expect(response.status).toBe(400);
      expect(await responseJson(response)).toEqual({ error: "Missing required fields" });
    }
  });

  test("omits a malformed optional comment without rejecting the annotation", async () => {
    const handler = createEditorAnnotationHandler();
    const response = await handlePost(handler, JSON.stringify({
      filePath: "src/example.ts",
      selectedText: "text",
      lineStart: 1,
      lineEnd: 1,
      comment: 42,
    }));

    expect(response.status).toBe(200);
    const getResponse = await handler.handle(
      new Request(`${endpoint}/api/editor-annotations`),
      new URL(`${endpoint}/api/editor-annotations`),
    );
    expect(await responseJson(getResponse!)).toEqual({
      annotations: [{
        id: expect.any(String),
        filePath: "src/example.ts",
        selectedText: "text",
        lineStart: 1,
        lineEnd: 1,
        createdAt: expect.any(Number),
      }],
    });
  });
});
