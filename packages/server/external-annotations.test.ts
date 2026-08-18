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
});
