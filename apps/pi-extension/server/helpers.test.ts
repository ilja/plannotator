import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import { parseBody, type RequestBodyStream } from "./helpers";

function mockRequest(body: string): RequestBodyStream {
  const emitter = new EventEmitter();
  queueMicrotask(() => {
    emitter.emit("data", body);
    emitter.emit("end");
  });

  return {
    on(event: "data" | "end", listener: () => void): void {
      emitter.on(event, listener);
    },
  };
}

describe("parseBody", () => {
  test("parses JSON objects without judging their shape", async () => {
    await expect(parseBody(mockRequest('{"filePath":"src/app.ts"}'))).resolves.toEqual({
      ok: true,
      value: { filePath: "src/app.ts" },
    });
  });

  test("valid JSON with the wrong shape still parses (schemas decide validity)", async () => {
    await expect(parseBody(mockRequest("[1, 2, 3]"))).resolves.toEqual({
      ok: true,
      value: [1, 2, 3],
    });
    await expect(parseBody(mockRequest("null"))).resolves.toEqual({ ok: true, value: null });
  });

  test("unparseable bytes resolve to not-ok instead of a fake object", async () => {
    await expect(parseBody(mockRequest("not-json"))).resolves.toEqual({ ok: false });
    await expect(parseBody(mockRequest(""))).resolves.toEqual({ ok: false });
  });
});
