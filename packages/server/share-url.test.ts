import { describe, expect, mock, test } from "bun:test";
import { Option, Schema } from "effect";
import { decompress } from "@plannotator/shared/compress";
import { generateRemoteShareUrl, writeRemoteShareLink, type RemoteShareFetch } from "./share-url";

const HashPayloadSchema = Schema.Struct({
  p: Schema.String,
  a: Schema.Array(Schema.Unknown),
});

const PasteUploadBodySchema = Schema.Struct({
  data: Schema.String,
});

describe("generateRemoteShareUrl", () => {
  test("keeps markdown remote shares hash-based", async () => {
    const url = await generateRemoteShareUrl("# Plan", "https://share.example.test");
    expect(url.startsWith("https://share.example.test/#")).toBe(true);

    const rawPayload = await decompress(url.split("#")[1]);
    const payload = Option.getOrThrow(Schema.decodeUnknownOption(HashPayloadSchema)(rawPayload));
    expect(payload).toEqual({ p: "# Plan", a: [] });
  });

  test("uses encrypted paste links for raw HTML remote shares", async () => {
    const fetchImpl: RemoteShareFetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://paste.example.test/api/paste");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      const rawBody = JSON.parse(String(init?.body));
      const body = Option.getOrThrow(Schema.decodeUnknownOption(PasteUploadBodySchema)(rawBody));
      expect(body.data.length > 0).toBe(true);
      return new Response(JSON.stringify({ id: "abc123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const url = await generateRemoteShareUrl("", "https://share.example.test", {
      rawHtml: "<!doctype html><h1>Hello</h1>",
      pasteApiUrl: "https://paste.example.test",
      fetchImpl,
    });

    expect(url).toMatch(/^https:\/\/share\.example\.test\/p\/abc123#key=[A-Za-z0-9_-]+&paste=/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("warns instead of silently dropping raw HTML remote share failures", async () => {
    const fetchImpl: RemoteShareFetch = mock(async () =>
      new Response(JSON.stringify({ error: "Payload too large (max 5 MB encrypted)" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const writeMock: typeof process.stderr.write = (chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    };
    const originalWrite = process.stderr.write;
    let stderr = "";
    process.stderr.write = writeMock;

    try {
      await writeRemoteShareLink("", "https://share.example.test", "annotate", "HTML document only", {
        rawHtml: "<!doctype html><h1>Hello</h1>",
        pasteApiUrl: "https://paste.example.test",
        fetchImpl,
      });
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderr).toContain("Warning: could not create remote share link for HTML document only.");
    expect(stderr).toContain("Payload too large (max 5 MB encrypted)");
    expect(stderr).toContain("HTML sharing uses the paste service");
  });

  test.each([
    ["missing id", {}],
    ["empty id", { id: "" }],
    ["non-string id", { id: 123 }],
    ["malformed body", null],
  ])("throws when paste success response has %s", async (_label, body) => {
    const fetchImpl: RemoteShareFetch = mock(async () => {
      const responseBody = JSON.stringify(body);
      return new Response(responseBody, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(
      generateRemoteShareUrl("", "https://share.example.test", {
        rawHtml: "<!doctype html><h1>Hello</h1>",
        pasteApiUrl: "https://paste.example.test",
        fetchImpl,
      }),
    ).rejects.toThrow("Paste service response missing id");
  });

  test.each([
    ["malformed error body", "not-json", "Paste service returned 413"],
    ["blank error", { error: "   " }, "Paste service returned 413"],
    ["missing error", {}, "Paste service returned 413"],
    ["non-string error", { error: 123 }, "Paste service returned 413"],
    ["unreadable error body", null, "Paste service returned 413"],
  ])("surfaces paste error fallback for %s", async (_label, errorBody, expectedFallback) => {
    const fetchImpl: RemoteShareFetch = mock(async () => {
      if (errorBody === null) {
        return new Response("not-json", {
          status: 413,
          headers: { "Content-Type": "text/plain" },
        });
      }
      const responseBody = errorBody === "not-json" ? errorBody : JSON.stringify(errorBody);
      return new Response(responseBody, {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    });
    const writes: string[] = [];
    const writeMock: typeof process.stderr.write = (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    };
    const originalWrite = process.stderr.write;
    process.stderr.write = writeMock;
    try {
      await writeRemoteShareLink("", "https://share.example.test", "annotate", "doc", {
        rawHtml: "<!doctype html><h1>Hello</h1>",
        pasteApiUrl: "https://paste.example.test",
        fetchImpl,
      });
    } finally {
      process.stderr.write = originalWrite;
    }
    expect(writes.join("")).toContain(expectedFallback);
  });
});
