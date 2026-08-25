import { describe, expect, test } from "bun:test";

import {
  decodeCodePathValidationResponse,
} from "./codePathValidationResponse";

describe("decodeCodePathValidationResponse", () => {
  test("decodes every result variant", () => {
    const response = decodeCodePathValidationResponse({
      results: {
        found: { status: "found", resolved: "/repo/src/found.ts" },
        ambiguous: { status: "ambiguous", matches: ["src/a.ts", "src/b.ts"] },
        missing: { status: "missing" },
        unavailable: { status: "unavailable" },
      },
    });

    expect([...response.entries()]).toEqual([
      ["found", { status: "found", resolved: "/repo/src/found.ts" }],
      ["ambiguous", { status: "ambiguous", matches: ["src/a.ts", "src/b.ts"] }],
      ["missing", { status: "missing" }],
      ["unavailable", { status: "unavailable" }],
    ]);
  });

  test("preserves valid siblings and compatible empty values", () => {
    const response = decodeCodePathValidationResponse({
      results: {
        first: { status: "ambiguous", matches: ["", "same.ts", "same.ts"] },
        broken: { status: "found", resolved: 42 },
        second: { status: "found", resolved: "" },
        alsoBroken: { status: "ambiguous", matches: ["valid", 42] },
        third: { status: "missing" },
      },
    });

    expect([...response.entries()]).toEqual([
      ["first", { status: "ambiguous", matches: ["", "same.ts", "same.ts"] }],
      ["second", { status: "found", resolved: "" }],
      ["third", { status: "missing" }],
    ]);
  });

  test("rejects malformed envelopes and keeps prototype-like keys as data", () => {
    expect(decodeCodePathValidationResponse(null)).toEqual(new Map());
    expect(decodeCodePathValidationResponse({})).toEqual(new Map());
    expect(decodeCodePathValidationResponse({ results: [] })).toEqual(new Map());

    const response = decodeCodePathValidationResponse(JSON.parse(
      '{"results":{"__proto__":{"status":"found","resolved":"/unsafe"},"constructor":{"status":"missing"}}}',
    ));


    expect(response.get("__proto__")).toEqual({ status: "found", resolved: "/unsafe" });
    expect(response.get("constructor")).toEqual({ status: "missing" });
  });
});
