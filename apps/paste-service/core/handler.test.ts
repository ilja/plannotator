import { describe, expect, test } from "bun:test";
import {
  createPaste,
  DEFAULT_PASTE_MAX_SIZE,
  handleRequest,
} from "./handler";
import type { PasteStore } from "./storage";

class MemoryPasteStore implements PasteStore {
  values = new Map<string, string>();

  async put(id: string, data: string): Promise<void> {
    this.values.set(id, data);
  }

  async get(id: string): Promise<string | null> {
    return this.values.get(id) ?? null;
  }
}

describe("paste payload limits", () => {
  test("default limit accepts HTML-scale encrypted payloads above the old 512 KB ceiling", async () => {
    const store = new MemoryPasteStore();

    const result = await createPaste("x".repeat(600 * 1024), store);

    expect(result.id).toHaveLength(8);
    expect(store.values.get(result.id)).toHaveLength(600 * 1024);
  });

  test("rejects payloads above the default encrypted payload limit", async () => {
    const store = new MemoryPasteStore();

    await expect(createPaste("x".repeat(DEFAULT_PASTE_MAX_SIZE + 1), store))
      .rejects
      .toMatchObject({
        status: 413,
        message: "Payload too large (max 5 MB encrypted)",
      });
  });
});

describe("handleRequest", () => {
  const cors: Record<string, string> = {};

  function post(body: string): Request {
    return new Request("http://localhost/api/paste", { method: "POST", body });
  }

  test("creates a paste from a valid body", async () => {
    const store = new MemoryPasteStore();

    const response = await handleRequest(
      post(JSON.stringify({ data: "hello" })),
      store,
      cors
    );

    expect(response.status).toBe(201);
    const { id } = await response.json();
    expect(store.values.get(id)).toBe("hello");
  });

  test("rejects a non-string data field", async () => {
    const store = new MemoryPasteStore();

    const response = await handleRequest(
      post(JSON.stringify({ data: 42 })),
      store,
      cors
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Missing or invalid "data" field',
    });
  });

  test("rejects an empty string data field", async () => {
    const store = new MemoryPasteStore();

    const response = await handleRequest(
      post(JSON.stringify({ data: "" })),
      store,
      cors
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Missing or invalid "data" field',
    });
  });

  test("rejects a missing data field", async () => {
    const store = new MemoryPasteStore();

    const response = await handleRequest(post(JSON.stringify({})), store, cors);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Missing or invalid "data" field',
    });
  });

  test("rejects malformed JSON", async () => {
    const store = new MemoryPasteStore();

    const response = await handleRequest(post("not json"), store, cors);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  test("rejects payloads above the limit", async () => {
    const store = new MemoryPasteStore();

    const response = await handleRequest(
      post(JSON.stringify({ data: "x".repeat(DEFAULT_PASTE_MAX_SIZE + 1) })),
      store,
      cors
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Payload too large (max 5 MB encrypted)",
    });
  });
});
