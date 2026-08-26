import { describe, expect, test } from "bun:test";
import { decodeGitAddResponse, readGitAddResponse } from "./git-add-response";

describe("decodeGitAddResponse", () => {
  test("decodes a successful response", () => {
    expect(decodeGitAddResponse({ ok: true })).toEqual({ ok: true });
  });

  test("decodes only string error envelopes", () => {
    expect(decodeGitAddResponse({ error: "Permission denied" })).toEqual({
      ok: false,
      error: "Permission denied",
    });
    expect(decodeGitAddResponse({ error: "" })).toEqual({ ok: false, error: "" });
  });

  test("rejects malformed responses and arrays", () => {
    for (const value of [
      null,
      [],
      {},
      { ok: false },
      { ok: "true" },
      { error: 42 },
      { error: { message: "Do not trust this" } },
    ]) {
      expect(decodeGitAddResponse(value)).toBeUndefined();
    }
  });
});

describe("readGitAddResponse", () => {
  test("reads a valid successful response", async () => {
    await expect(readGitAddResponse(new Response(JSON.stringify({ ok: true })))).resolves.toEqual({
      ok: true,
    });
  });

  test("uses a string error from a non-OK response", async () => {
    await expect(
      readGitAddResponse(
        new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
      ),
    ).resolves.toEqual({ ok: false, error: "Permission denied" });
    await expect(
      readGitAddResponse(
        new Response(JSON.stringify({ ok: true, error: "Permission denied" }), { status: 403 }),
      ),
    ).resolves.toEqual({ ok: false, error: "Permission denied" });
  });

  test("uses Failed for malformed success and error envelopes", async () => {
    const malformedResponses = [
      new Response(JSON.stringify({}), { status: 200 }),
      new Response(JSON.stringify({ ok: false }), { status: 200 }),
      new Response(JSON.stringify({ ok: "true" }), { status: 200 }),
      new Response(JSON.stringify({ error: "Do not trust this" }), { status: 200 }),
      new Response(JSON.stringify({ ok: true }), { status: 500 }),
      new Response(JSON.stringify({ error: "" }), { status: 500 }),
      new Response(JSON.stringify({ error: 42 }), { status: 500 }),
      new Response(JSON.stringify({ error: { message: "Do not trust this" } }), { status: 500 }),
      new Response(JSON.stringify([]), { status: 500 }),
    ];

    for (const response of malformedResponses) {
      await expect(readGitAddResponse(response)).resolves.toEqual({ ok: false, error: "Failed" });
    }
  });

  test("uses Failed for invalid JSON", async () => {
    await expect(readGitAddResponse(new Response("{invalid-json"))).resolves.toEqual({
      ok: false,
      error: "Failed",
    });
  });
});
