import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useCodeFilePopout } from "./useCodeFilePopout";

const hasDom = globalThis.document !== undefined;
const realFetch = globalThis.fetch;
const roots: Root[] = [];

function installFetch(responses: Response[]): void {
  let index = 0;
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => responses[index++] ?? new Response(null, { status: 500 }),
    { preconnect: (): void => {} },
  );
}

function HookHarness(): React.JSX.Element {
  const { open, popoutProps, isLoading } = useCodeFilePopout({
    buildUrl: (path) => `/api/doc?path=${encodeURIComponent(path)}`,
  });

  return (
    <div>
      <button type="button" onClick={() => void open("src/example.ts:3")}>
        Open
      </button>
      <output
        data-loading={String(isLoading)}
        data-filepath={popoutProps?.filepath ?? ""}
        data-contents={popoutProps?.contents ?? ""}
        data-error={popoutProps?.error ?? ""}
        data-line={String(popoutProps?.line ?? "")}
      />
    </div>
  );
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mountHarness(): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(<HookHarness />);
    await flushAsyncWork();
  });
  return host;
}

async function openFile(host: HTMLDivElement): Promise<HTMLOutputElement> {
  const button = host.querySelector("button");
  const output = host.querySelector("output");
  if (!(button instanceof HTMLButtonElement) || !(output instanceof HTMLOutputElement)) {
    throw new Error("Hook harness did not render");
  }
  await act(async () => {
    button.click();
    await flushAsyncWork();
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

describe("useCodeFilePopout response handling", () => {
  test.skipIf(!hasDom)("opens only a validated code-file response", async () => {
    installFetch([
      new Response(
        JSON.stringify({
          codeFile: true,
          contents: "const value = 1;",
          filepath: "/repo/src/example.ts",
          line: 4,
        }),
      ),
    ]);
    const output = await openFile(await mountHarness());

    expect(output.dataset.loading).toBe("false");
    expect(output.dataset.filepath).toBe("/repo/src/example.ts");
    expect(output.dataset.contents).toBe("const value = 1;");
    expect(output.dataset.line).toBe("4");
    expect(output.dataset.error).toBe("");
  });

  test.skipIf(!hasDom)("replaces a malformed fallback after a valid retry", async () => {
    installFetch([
      new Response(JSON.stringify({ contents: 42, filepath: "/repo/broken.ts" })),
      new Response(
        JSON.stringify({
          codeFile: true,
          contents: "valid after retry",
          filepath: "/repo/src/example.ts",
        }),
      ),
    ]);
    const host = await mountHarness();

    const malformed = await openFile(host);
    expect(malformed.dataset.contents).toBe("");
    expect(malformed.dataset.error).toBe("File not found in repo: src/example.ts:3");

    const retried = await openFile(host);
    expect(retried.dataset.contents).toBe("valid after retry");
    expect(retried.dataset.error).toBe("");
  });

  test.skipIf(!hasDom)(
    "uses the existing fallback for malformed, non-OK, and invalid JSON responses",
    async () => {
      installFetch([
        new Response(
          JSON.stringify({ codeFile: true, contents: "valid", filepath: "/repo/valid.ts" }),
        ),
        new Response(JSON.stringify({ contents: 42, filepath: "/repo/broken.ts" })),
        new Response(JSON.stringify({ error: "Access denied" }), { status: 403 }),
        new Response("{invalid-json"),
      ]);
      const host = await mountHarness();

      const valid = await openFile(host);
      expect(valid.dataset.contents).toBe("valid");

      const malformed = await openFile(host);
      expect(malformed.dataset.contents).toBe("");
      expect(malformed.dataset.error).toBe("File not found in repo: src/example.ts:3");

      const denied = await openFile(host);
      expect(denied.dataset.error).toBe("Access denied");

      const invalidJson = await openFile(host);
      expect(invalidJson.dataset.error).toBe("Failed to load: src/example.ts:3");
    },
  );
});
