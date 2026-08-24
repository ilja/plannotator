import { describe, expect, test } from "bun:test";

import { handleCodeNavResolve } from "./code-nav";

describe("handleCodeNavResolve", () => {
  const request = (body: BodyInit): Request => new Request(
    "http://localhost/api/code-nav/resolve",
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
  );

  test("rejects malformed JSON with the invalid request body category", async () => {
    const response = await handleCodeNavResolve(request("{"), process.cwd(), []);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
  });

  test("rejects invalid request fields before navigation runs", async () => {
    for (const [body, error] of [
      [{ filePath: "src/server.ts", side: "new" }, "Missing or empty symbol"],
      [{ symbol: "   ", filePath: "src/server.ts", side: "new" }, "Missing or empty symbol"],
      [{ symbol: "symbol", side: "new" }, "Missing filePath"],
      [{ symbol: "symbol", filePath: "   ", side: "new" }, "Missing filePath"],
      [{ symbol: "symbol", filePath: "../server.ts", side: "new" }, "Invalid filePath"],
      [{ symbol: "symbol", filePath: "/server.ts", side: "new" }, "Invalid filePath"],
      [{ symbol: "symbol", filePath: "src/server.ts", side: "both" }, "side must be 'old' or 'new'"],
    ] as const) {
      const response = await handleCodeNavResolve(
        request(JSON.stringify(body)),
        process.cwd(),
        [],
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
  });

  test("rejects non-object JSON with the invalid request body category", async () => {
    const response = await handleCodeNavResolve(request(JSON.stringify([])), process.cwd(), []);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request body" });
  });
});
