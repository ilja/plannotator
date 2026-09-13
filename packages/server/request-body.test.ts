import { describe, expect, test } from "bun:test";
import { readJsonBody } from "./request-body.ts";

describe("readJsonBody", () => {
  test("parses valid JSON without judging its shape", async () => {
    const object = await readJsonBody(
      new Request("http://localhost/api/x", {
        method: "POST",
        body: JSON.stringify({ diffType: "uncommitted" }),
      }),
    );

    expect(object).toEqual({ ok: true, value: { diffType: "uncommitted" } });

    const array = await readJsonBody(
      new Request("http://localhost/api/x", { method: "POST", body: "[1,2]" }),
    );

    expect(array).toEqual({ ok: true, value: [1, 2] });
  });

  test("reports unparseable bytes instead of throwing", async () => {
    const malformed = await readJsonBody(
      new Request("http://localhost/api/x", { method: "POST", body: "not-json{" }),
    );

    expect(malformed).toEqual({ ok: false });
  });
});
