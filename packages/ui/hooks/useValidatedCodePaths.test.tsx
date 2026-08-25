import { afterEach, describe, expect, test } from "bun:test";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useValidatedCodePaths } from "./useValidatedCodePaths";

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

function HookHarness({ initialMarkdown = "src/example.ts" }: { initialMarkdown?: string }): React.JSX.Element {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const { validated, ready } = useValidatedCodePaths(markdown);

  return (
    <div>
      <button type="button" onClick={() => setMarkdown((current) => current === "src/example.ts" ? "src/other.ts" : "src/example.ts")}>Switch</button>
      <output
        data-ready={String(ready)}
        data-keys={[...validated.keys()].join("|")}
        data-status={validated.get("src/example.ts")?.status ?? ""}
        data-other-status={validated.get("src/other.ts")?.status ?? ""}
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

async function readOutput(host: HTMLDivElement): Promise<HTMLOutputElement> {
  const output = host.querySelector("output");
  if (!(output instanceof HTMLOutputElement)) throw new Error("Hook harness did not render");
  return output;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  globalThis.fetch = realFetch;
  if (hasDom) document.body.innerHTML = "";
});

describe("useValidatedCodePaths response handling", () => {
  test.skipIf(!hasDom)("retains valid entries while filtering malformed siblings", async () => {
    installFetch([new Response(JSON.stringify({
      results: {
        "src/example.ts": { status: "found", resolved: "/repo/src/example.ts" },
        "src/broken.ts": { status: "found", resolved: 42 },
        "src/other.ts": { status: "missing" },
      },
    }))]);
    const host = await mountHarness();

    const output = await readOutput(host);
    expect(output.dataset.ready).toBe("true");
    expect(output.dataset.status).toBe("found");
    expect(output.dataset.otherStatus).toBe("missing");
    expect(output.dataset.keys).toBe("src/example.ts|src/other.ts");
  });

  test.skipIf(!hasDom)("uses the existing ready fallback for malformed, non-OK, and invalid JSON responses", async () => {
    installFetch([
      new Response(JSON.stringify({ results: { "src/example.ts": { status: "found", resolved: "/repo/example.ts" } } })),
      new Response(JSON.stringify({ results: [] })),
      new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }),
      new Response("{invalid-json"),
    ]);
    const host = await mountHarness();
    const switchButton = host.querySelector("button");
    if (!(switchButton instanceof HTMLButtonElement)) throw new Error("Switch button did not render");

    expect((await readOutput(host)).dataset.status).toBe("found");

    for (let index = 0; index < 3; index++) {
      await act(async () => {
        switchButton.click();
        await flushAsyncWork();
      });
      const output = await readOutput(host);
      expect(output.dataset.ready).toBe("true");
      expect(output.dataset.keys).toBe("");
    }
  });

  test.skipIf(!hasDom)("replaces a malformed result after a valid retry", async () => {
    installFetch([
      new Response(JSON.stringify({ results: { "src/example.ts": { status: "found", resolved: 42 } } })),
      new Response(JSON.stringify({ results: { "src/other.ts": { status: "missing" } } })),
    ]);
    const host = await mountHarness();
    const switchButton = host.querySelector("button");
    if (!(switchButton instanceof HTMLButtonElement)) throw new Error("Switch button did not render");

    await act(async () => {
      switchButton.click();
      await flushAsyncWork();
    });
    const output = await readOutput(host);
    expect(output.dataset.ready).toBe("true");
    expect(output.dataset.status).toBe("");
    expect(output.dataset.otherStatus).toBe("missing");
  });

  test.skipIf(!hasDom)("ignores a cancelled response from an earlier markdown value", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    globalThis.fetch = Object.assign(
      async (): Promise<Response> => new Promise((resolve) => resolvers.push(resolve)),
      { preconnect: (): void => {} },
    );
    const host = await mountHarness();
    const switchButton = host.querySelector("button");
    if (!(switchButton instanceof HTMLButtonElement)) throw new Error("Switch button did not render");

    await act(async () => {
      switchButton.click();
      await flushAsyncWork();
    });
    expect(resolvers).toHaveLength(2);

    await act(async () => {
      resolvers[0](new Response(JSON.stringify({ results: { "src/example.ts": { status: "found", resolved: "/stale" } } })));
      await flushAsyncWork();
    });
    expect((await readOutput(host)).dataset.keys).toBe("");

    await act(async () => {
      resolvers[1](new Response(JSON.stringify({ results: { "src/other.ts": { status: "missing" } } })));
      await flushAsyncWork();
    });
    expect((await readOutput(host)).dataset.otherStatus).toBe("missing");
    expect((await readOutput(host)).dataset.status).toBe("");
  });
});
