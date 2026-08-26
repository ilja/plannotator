import { describe, expect, test } from "bun:test";
import { Result } from "effect";
import { decodeOpenInResponse, readOpenInResponse } from "./openInResponse";

describe("decodeOpenInResponse", () => {
  test("decodes a valid success response", () => {
    const decoded = decodeOpenInResponse({ ok: true });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) expect(decoded.success).toEqual({ ok: true });
  });

  test("decodes a valid failure response and preserves an empty error", () => {
    const decoded = decodeOpenInResponse({ ok: false, error: "" });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) expect(decoded.success).toEqual({ ok: false, error: "" });
  });

  test("rejects malformed success and failure envelopes", () => {
    for (const value of [
      null,
      {},
      { ok: "true" },
      { ok: false },
      { ok: false, error: 42 },
      { ok: false, error: null },
    ]) {
      expect(Result.isFailure(decodeOpenInResponse(value))).toBeTrue();
    }
  });
});

describe("readOpenInResponse", () => {
  test("reads valid JSON through the response boundary", async () => {
    const response = new Response(JSON.stringify({ ok: false, error: "Could not launch" }));

    await expect(readOpenInResponse(response)).resolves.toEqual({
      ok: false,
      error: "Could not launch",
    });
  });

  test("returns null for invalid JSON", async () => {
    await expect(readOpenInResponse(new Response("not json"))).resolves.toBeNull();
  });

  test("returns null for malformed JSON envelopes", async () => {
    const response = new Response(JSON.stringify({ ok: "true" }));

    await expect(readOpenInResponse(response)).resolves.toBeNull();
  });

  test("returns null for non-OK responses without parsing the body", async () => {
    const response = new Response(JSON.stringify({ ok: false, error: "Do not trust this" }), {
      status: 500,
    });
    let jsonCalls = 0;
    response.json = async () => {
      jsonCalls += 1;
      throw new Error("Non-OK response body should not be parsed");
    };

    await expect(readOpenInResponse(response)).resolves.toBeNull();
    expect(jsonCalls).toBe(0);
  });
});
