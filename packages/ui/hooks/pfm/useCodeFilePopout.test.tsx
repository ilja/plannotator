import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useCodeFilePopout } from "./useCodeFilePopout";

const hasDom = globalThis.document !== undefined;

const realFetch = globalThis.fetch;

const roots: Root[] = [];

function installFetch(responses: Array<Response | Promise<Response>>): void {
  let index = 0;
  globalThis.fetch = Object.assign(
    async (): Promise<Response> =>
      (await responses[index++]) ?? new Response(null, { status: 500 }),
    { preconnect: (): void => {} },
  );
}

function validFileResponse(codePath: string, contents: string): Response {
  return new Response(JSON.stringify({ codeFile: true, contents, filepath: codePath }));
}

function HookHarness(): React.JSX.Element {
  const { open, close, popoutProps } = useCodeFilePopout({
    buildUrl: (path) => `/api/doc?path=${encodeURIComponent(path)}`,
  });

  return (
    <div>
      <button type="button" onClick={() => void open("src/example.ts:3")}>
        Open
      </button>
      <button type="button" onClick={() => void open("src/other.ts")}>
        Open other
      </button>
      <button type="button" onClick={() => close()}>
        Close
      </button>
      <output
        data-open={popoutProps === null ? "" : "open"}
        data-filepath={popoutProps?.filepath ?? ""}
        data-contents={popoutProps?.contents ?? ""}
        data-error={popoutProps?.error ?? ""}
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

async function clickButton(host: HTMLDivElement, label: string): Promise<HTMLOutputElement> {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === label);
  const output = host.querySelector("output");

  if (!button || !(output instanceof HTMLOutputElement)) {
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

    expect(output.dataset.open).toBe("open");
    expect(output.dataset.filepath).toBe("/repo/src/example.ts");
    expect(output.dataset.contents).toBe("const value = 1;");
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

  test.skipIf(!hasDom)("opening a second file clears the stale popout while it loads", async () => {
    let release!: () => void;

    const gate = new Promise<Response>((resolve) => {
      release = () => resolve(validFileResponse("src/other.ts", "other contents"));
    });

    installFetch([validFileResponse("src/example.ts:3", "first contents"), gate]);

    const host = await mountHarness();

    const first = await openFile(host);
    expect(first.dataset.filepath).toBe("src/example.ts:3");

    const loading = await clickButton(host, "Open other");
    expect(loading.dataset.open).toBe("");

    await act(async () => {
      release();
      await Promise.resolve();
      await Promise.resolve();
    });

    const output = host.querySelector("output");

    if (!(output instanceof HTMLOutputElement)) throw new Error("Hook harness did not render");
    expect(output.dataset.filepath).toBe("src/other.ts");
    expect(output.dataset.contents).toBe("other contents");
  });
});
