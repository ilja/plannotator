import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PRMetadata } from "@plannotator/shared/pr-types";
import { readPRContextResponse, usePRContext } from "./usePRContext";

const hasDom = globalThis.document !== undefined;

const realFetch = globalThis.fetch;

const roots: Root[] = [];

const metadata: PRMetadata = {
  host: "github.com",
  owner: "example",
  repo: "project",
  number: 42,
  title: "Safe response decoding",
  author: "author",
  baseBranch: "main",
  headBranch: "feature",
  baseSha: "base-sha",
  headSha: "head-sha",
  url: "https://github.com/example/project/pull/42",
};

const validContext = {
  body: "Review body",
  state: "OPEN",
  isDraft: false,
  labels: [],
  reviewDecision: "",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  comments: [],
  reviews: [],
  reviewThreads: [],
  checks: [],
  linkedIssues: [],
};

function installFetch(responses: Response[]): void {
  let index = 0;
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => responses[index++] ?? responses[responses.length - 1],
    { preconnect: (): void => {} },
  );
}

function HookHarness(): React.JSX.Element {
  const { prContext, isLoading, error, fetchContext } = usePRContext(metadata);

  return (
    <div>
      <button type="button" onClick={() => void fetchContext()}>
        Fetch
      </button>
      <output
        data-loading={String(isLoading)}
        data-error={error ?? ""}
        data-context={prContext ? "loaded" : ""}
      >
        {error ?? (isLoading ? "Loading" : prContext ? "Loaded" : "Idle")}
      </output>
    </div>
  );
}

async function renderHarness(): Promise<void> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(<HookHarness />);
    await Promise.resolve();
  });
}

async function clickFetch(): Promise<HTMLOutputElement> {
  const output = document.querySelector("output");
  const button = document.querySelector("button");

  if (!(output instanceof HTMLOutputElement) || !(button instanceof HTMLButtonElement)) {
    throw new Error("Hook harness did not render");
  }

  await act(async () => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
  });

  return output;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }

  globalThis.fetch = realFetch;

  if (hasDom) document.body.innerHTML = "";
});

describe("readPRContextResponse", () => {
  test("resolves a valid successful response", async () => {
    await expect(
      readPRContextResponse(new Response(JSON.stringify(validContext), { status: 200 })),
    ).resolves.toEqual(validContext);
  });

  test("rejects invalid JSON from a successful response", async () => {
    await expect(
      readPRContextResponse(new Response("{invalid-json", { status: 200 })),
    ).rejects.toThrow();
  });

  test("rejects a malformed successful envelope", async () => {
    await expect(
      readPRContextResponse(
        new Response(JSON.stringify({ body: "missing fields" }), { status: 200 }),
      ),
    ).rejects.toThrow();
  });

  test("uses a string error from a non-OK response", async () => {
    await expect(
      readPRContextResponse(
        new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
      ),
    ).rejects.toThrow("Permission denied");
  });

  test("uses the HTTP status when a non-OK body is invalid JSON", async () => {
    await expect(
      readPRContextResponse(new Response("{invalid-json", { status: 502 })),
    ).rejects.toThrow("HTTP 502");
  });

  test("uses the HTTP status when a non-OK error is not a string", async () => {
    await expect(
      readPRContextResponse(
        new Response(JSON.stringify({ error: { message: "untrusted" } }), { status: 503 }),
      ),
    ).rejects.toThrow("HTTP 503");
  });
});

describe("usePRContext response handling", () => {
  test.skipIf(!hasDom)(
    "turns invalid successful JSON into an error and permits retry",
    async () => {
      installFetch([
        new Response("{invalid-json", { status: 200 }),
        new Response(JSON.stringify(validContext), { status: 200 }),
      ]);
      await renderHarness();

      const failed = await clickFetch();
      expect(failed.dataset.loading).toBe("false");
      expect(failed.dataset.error).not.toBe("");
      expect(failed.dataset.context).toBe("");

      const retried = await clickFetch();
      expect(retried.dataset.loading).toBe("false");
      expect(retried.dataset.error).toBe("");
      expect(retried.dataset.context).toBe("loaded");
    },
  );

  test.skipIf(!hasDom)("turns malformed successful envelopes into an error", async () => {
    installFetch([
      new Response(JSON.stringify({ body: "missing required fields" }), { status: 200 }),
    ]);
    await renderHarness();

    const output = await clickFetch();
    expect(output.dataset.loading).toBe("false");
    expect(output.dataset.error).not.toBe("");
    expect(output.dataset.context).toBe("");
  });

  test.skipIf(!hasDom)("uses only a string error from non-OK responses", async () => {
    installFetch([new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 })]);
    await renderHarness();

    const output = await clickFetch();
    expect(output.dataset.error).toBe("Permission denied");
    expect(output.dataset.loading).toBe("false");
  });

  test.skipIf(!hasDom)("falls back to HTTP status for invalid non-OK error bodies", async () => {
    installFetch([
      new Response("{invalid-json", { status: 502 }),
      new Response(JSON.stringify({ error: { message: "untrusted" } }), { status: 503 }),
    ]);
    await renderHarness();

    const invalidJson = await clickFetch();
    expect(invalidJson.dataset.error).toBe("HTTP 502");

    const nonStringError = await clickFetch();
    expect(nonStringError.dataset.error).toBe("HTTP 503");
  });
});
