import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const hasDom = globalThis.document !== undefined;
if (hasDom)
  Object.defineProperty(window, "__PLANNOTATOR_VSCODE", { configurable: true, value: true });
const { useEditorAnnotations } = await import("./useEditorAnnotations");

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
  const { editorAnnotations } = useEditorAnnotations();
  return (
    <output
      data-ids={editorAnnotations.map(({ id }) => id).join("|")}
      data-count={String(editorAnnotations.length)}
    />
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

async function waitForPolls(milliseconds: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    await flushAsyncWork();
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  globalThis.fetch = realFetch;
  if (hasDom) {
    document.body.innerHTML = "";
    Reflect.deleteProperty(window, "__PLANNOTATOR_VSCODE");
  }
});

describe("useEditorAnnotations response handling", () => {
  test.skipIf(!hasDom)("clears stale annotations for a valid empty response", async () => {
    installFetch([
      new Response(
        JSON.stringify({
          annotations: [
            {
              id: "first",
              filePath: "src/a.ts",
              selectedText: "a",
              lineStart: 1,
              lineEnd: 1,
              createdAt: 1,
            },
          ],
        }),
      ),
      new Response(JSON.stringify({ annotations: [] })),
    ]);
    const host = await mountHarness();
    await waitForPolls(550);

    expect(host.querySelector("output")?.dataset.count).toBe("0");
  });

  test.skipIf(!hasDom)(
    "preserves stale state for malformed responses and recovers on a later valid poll",
    async () => {
      installFetch([
        new Response(
          JSON.stringify({
            annotations: [
              {
                id: "first",
                filePath: "src/a.ts",
                selectedText: "a",
                lineStart: 1,
                lineEnd: 1,
                createdAt: 1,
              },
            ],
          }),
        ),
        new Response(JSON.stringify({ annotations: {} })),
        new Response("{invalid-json"),
        new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 }),
        new Response(
          JSON.stringify({
            annotations: [
              {
                id: "recovered",
                filePath: "src/b.ts",
                selectedText: "b",
                lineStart: 2,
                lineEnd: 2,
                createdAt: 2,
              },
            ],
          }),
        ),
      ]);
      const host = await mountHarness();

      await waitForPolls(1_600);
      expect(host.querySelector("output")?.dataset.ids).toBe("first");

      await waitForPolls(550);
      expect(host.querySelector("output")?.dataset.ids).toBe("recovered");
    },
  );
});
