import { describe, expect, test } from "bun:test";

import { handleCodeNavResolve } from "./code-nav";

describe("handleCodeNavResolve", () => {
  const request = (body: BodyInit): Request => new Request(
    "http://localhost/api/code-nav/resolve",
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
  );

  test("rejects malformed JSON", async () => {
    const response = await handleCodeNavResolve(request("{"), process.cwd(), []);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
  });

  test("rejects one invalid request field through the HTTP boundary", async () => {
    const response = await handleCodeNavResolve(
      request(JSON.stringify({ symbol: "symbol", filePath: "../server.ts", side: "new" })),
      process.cwd(),
      [],
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid filePath" });
  });

  test("rejects non-object JSON through the HTTP boundary", async () => {
    const response = await handleCodeNavResolve(request(JSON.stringify([])), process.cwd(), []);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
  });
});
