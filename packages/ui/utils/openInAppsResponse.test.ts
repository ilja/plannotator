import { describe, expect, test } from "bun:test";
import { Result, Schema } from "effect";
import {
  createOpenInAppsLoader,
  decodeOpenInAppsResponse,
  type OpenInAppsResponse,
} from "./openInAppsResponse";

const reveal = {
  id: "reveal",
  label: "Finder",
  kind: "file-manager" as const,
  icon: "finder",
};

const editor = {
  id: "vscode",
  label: "VS Code",
  kind: "editor" as const,
  icon: "vscode",
};

const terminal = {
  id: "terminal",
  label: "Terminal",
  kind: "terminal" as const,
  icon: "terminal",
};

type JsonResponseBody = Schema.Schema.Type<typeof Schema.Json>;

function availableResponse(apps: JsonResponseBody[]): JsonResponseBody {
  return { available: true, apps };
}

function jsonResponse(body: JsonResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("decodeOpenInAppsResponse", () => {
  test("decodes valid apps in response order", () => {
    const decoded = decodeOpenInAppsResponse(availableResponse([terminal, editor, reveal]));

    expect(Result.isSuccess(decoded)).toBeTrue();

    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        available: true,
        apps: [terminal, editor, reveal],
      });
    }
  });

  test("filters malformed app siblings while preserving valid order", () => {
    const decoded = decodeOpenInAppsResponse(
      availableResponse([
        terminal,
        { id: "bad", label: "Bad", kind: "editor", icon: 42 },
        editor,
        null,
        { id: "also-bad", label: "Bad", kind: "unknown", icon: "bad" },
        reveal,
      ]),
    );

    expect(Result.isSuccess(decoded)).toBeTrue();

    if (Result.isSuccess(decoded)) {
      expect(decoded.success.apps).toEqual([terminal, editor, reveal]);
    }
  });

  test("rejects malformed response roots", () => {
    for (const value of [
      null,
      [],
      42,
      "response",
      {},
      { available: true },
      { available: "yes", apps: [] },
      { available: true, apps: null },
    ]) {
      expect(Result.isFailure(decodeOpenInAppsResponse(value))).toBeTrue();
    }
  });

  test("preserves valid available and unavailable empty responses", () => {
    const available = decodeOpenInAppsResponse(availableResponse([]));
    const unavailable = decodeOpenInAppsResponse({ available: false, apps: [] });

    expect(Result.isSuccess(available)).toBeTrue();
    expect(Result.isSuccess(unavailable)).toBeTrue();

    if (Result.isSuccess(available) && Result.isSuccess(unavailable)) {
      expect(available.success).toEqual({ available: true, apps: [] });
      expect(unavailable.success).toEqual({ available: false, apps: [] });
    }
  });
});

describe("createOpenInAppsLoader", () => {
  test("returns unavailable for invalid JSON and retries after the failure", async () => {
    let calls = 0;

    const loader = createOpenInAppsLoader(async () => {
      calls += 1;

      return calls === 1
        ? new Response("not json")
        : jsonResponse({ available: true, apps: [editor] });
    });

    expect(await loader()).toEqual({ available: false, apps: [] });
    expect(await loader()).toEqual({ available: true, apps: [editor] });
    expect(calls).toBe(2);
  });

  test("returns unavailable for a non-OK response without parsing its body", async () => {
    const response = new Response("not parsed", { status: 503 });
    let jsonCalls = 0;
    response.json = async () => {
      jsonCalls += 1;
      throw new Error("JSON should not be parsed");
    };

    const loader = createOpenInAppsLoader(async () => response);

    expect(await loader()).toEqual({ available: false, apps: [] });
    expect(jsonCalls).toBe(0);
  });

  test("returns unavailable for a rejected request and retries after the failure", async () => {
    let calls = 0;

    const loader = createOpenInAppsLoader(async () => {
      calls += 1;

      if (calls === 1) throw new Error("Network unavailable");

      return jsonResponse({ available: true, apps: [editor] });
    });

    expect(await loader()).toEqual({ available: false, apps: [] });
    expect(await loader()).toEqual({ available: true, apps: [editor] });
    expect(calls).toBe(2);
  });

  test("returns unavailable for a malformed root and retries after the failure", async () => {
    let calls = 0;

    const loader = createOpenInAppsLoader(async () => {
      calls += 1;

      return calls === 1
        ? jsonResponse({ available: true, apps: {} })
        : jsonResponse({ available: true, apps: [] });
    });

    expect(await loader()).toEqual({ available: false, apps: [] });
    expect(await loader()).toEqual({ available: true, apps: [] });
    expect(calls).toBe(2);
  });

  test("memoizes successful responses, including available empty responses", async () => {
    let calls = 0;
    const response: OpenInAppsResponse = { available: true, apps: [] };

    const loader = createOpenInAppsLoader(async () => {
      calls += 1;

      return jsonResponse(response);
    });

    const first = loader();
    const second = loader();

    expect(first).toBe(second);
    expect(await first).toEqual(response);
    expect(await second).toEqual(response);
    expect(calls).toBe(1);
  });

  test("memoizes a valid unavailable response", async () => {
    let calls = 0;

    const loader = createOpenInAppsLoader(async () => {
      calls += 1;

      return jsonResponse({ available: false, apps: [] });
    });

    expect(await loader()).toEqual({ available: false, apps: [] });
    expect(await loader()).toEqual({ available: false, apps: [] });
    expect(calls).toBe(1);
  });
});
