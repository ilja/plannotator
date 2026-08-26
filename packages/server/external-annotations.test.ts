import { describe, expect, test, mock } from "bun:test";
import { createExternalAnnotationHandler } from "./external-annotations";

describe("external annotations SSE", () => {
  test("disables idle timeout for stream requests", async () => {
    const handler = createExternalAnnotationHandler("plan");
    const disableIdleTimeout = mock(() => {});

    const res = await handler.handle(
      new Request("http://localhost/api/external-annotations/stream"),
      new URL("http://localhost/api/external-annotations/stream"),
      { disableIdleTimeout },
    );

    expect(disableIdleTimeout).toHaveBeenCalledTimes(1);
    expect(res?.headers.get("content-type")).toBe("text/event-stream");
  });

  test("rejects non-object PATCH bodies", async () => {
    const handler = createExternalAnnotationHandler("plan");
    const url = new URL("http://localhost/api/external-annotations?id=missing");
    const response = await handler.handle(
      new Request(url, { method: "PATCH", body: JSON.stringify("not an object") }),
      url,
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({ error: "Invalid JSON" });
  });

  test("validates plan patch fields atomically while preserving unknown metadata", async () => {
    const handler = createExternalAnnotationHandler("plan");
    const baseUrl = "http://localhost/api/external-annotations";
    const createResponse = await handler.handle(
      new Request(baseUrl, {
        method: "POST",
        body: JSON.stringify({ source: "editor", text: "original" }),
      }),
      new URL(baseUrl),
    );
    const { ids } = await createResponse!.json();
    const id = ids[0];

    const invalid = await handler.handle(
      new Request(`${baseUrl}?id=${id}`, {
        method: "PATCH",
        body: JSON.stringify({ type: 7 }),
      }),
      new URL(`${baseUrl}?id=${id}`),
    );
    expect(invalid?.status).toBe(400);
    expect(await invalid?.json()).toEqual({ error: "Invalid JSON" });

    const unchanged = await handler.handle(new Request(baseUrl), new URL(baseUrl));
    expect(await unchanged?.json()).toMatchObject({
      version: 1,
      annotations: [{ id, text: "original" }],
    });

    const valid = await handler.handle(
      new Request(`${baseUrl}?id=${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          id: "spoofed-id",
          text: "updated",
          futureMetadata: { preserved: true },
        }),
      }),
      new URL(`${baseUrl}?id=${id}`),
    );
    expect(valid?.status).toBe(200);
    expect(await valid?.json()).toMatchObject({
      annotation: { id, text: "updated", futureMetadata: { preserved: true } },
    });
  });

  test("validates review line patches atomically", async () => {
    const handler = createExternalAnnotationHandler("review");
    const baseUrl = "http://localhost/api/external-annotations";
    const createResponse = await handler.handle(
      new Request(baseUrl, {
        method: "POST",
        body: JSON.stringify({
          source: "reviewer",
          filePath: "src/example.ts",
          lineStart: 1,
          lineEnd: 1,
          text: "original",
        }),
      }),
      new URL(baseUrl),
    );
    const { ids } = await createResponse!.json();
    const id = ids[0];

    const invalid = await handler.handle(
      new Request(`${baseUrl}?id=${id}`, {
        method: "PATCH",
        body: JSON.stringify({ lineStart: "bad" }),
      }),
      new URL(`${baseUrl}?id=${id}`),
    );
    expect(invalid?.status).toBe(400);

    const unchanged = await handler.handle(new Request(baseUrl), new URL(baseUrl));
    expect(await unchanged?.json()).toMatchObject({
      version: 1,
      annotations: [{ id, lineStart: 1, text: "original" }],
    });
  });
});
