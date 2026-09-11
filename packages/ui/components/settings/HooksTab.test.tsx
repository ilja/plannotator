import { afterEach, describe, expect, test } from "bun:test";
import { Schema } from "effect";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HooksTab } from "./HooksTab";

const hasDom = globalThis.document !== undefined;

const realFetch = globalThis.fetch;

const roots: Root[] = [];

type JsonResponseBody = Schema.Schema.Type<typeof Schema.Json>;

function installHooksStatusFetch(body: JsonResponseBody): void {
  globalThis.fetch = Object.assign(
    async (): Promise<Response> =>
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
      }),
    { preconnect: (): void => {} },
  );
}

function installRejectedHooksStatusFetch(): void {
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => Promise.reject(new Error("offline")),
    { preconnect: (): void => {} },
  );
}

async function renderHooksTab(): Promise<void> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(<HooksTab />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buttonWithText(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );

  if (button === undefined) throw new Error(`HooksTab button not found: ${label}`);

  return button;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }

  globalThis.fetch = realFetch;

  if (hasDom) document.body.innerHTML = "";
});

describe("HooksTab hooks status response handling", () => {
  test.skipIf(!hasDom)("renders a complete valid response", async () => {
    installHooksStatusFetch({
      pfmReminder: { enabled: true },
      improvementHook: {
        present: true,
        filePath: "/Users/example/.plannotator/hooks/compound/enterplanmode-improve-hook.txt",
        fileSize: 2_048,
        content: "Prefer focused tests.",
      },
      composedLength: 4_096,
    });

    await renderHooksTab();

    expect(document.body.textContent).toContain("Enabled");
    expect(document.body.textContent).toContain("Active");
    expect(document.body.textContent).toContain("2.0KB");
    expect(document.body.textContent).toContain(
      "~/.plannotator/hooks/compound/enterplanmode-improve-hook.txt",
    );

    await act(async () => {
      buttonWithText("▸ Show content").click();
    });

    expect(document.body.textContent).toContain("Prefer focused tests.");
  });

  test.skipIf(!hasDom)(
    "retains a valid PFM section when the improvement hook is malformed",
    async () => {
      installHooksStatusFetch({
        pfmReminder: { enabled: true },
        improvementHook: { present: "yes" },
        composedLength: 512,
      });

      await renderHooksTab();

      expect(document.body.textContent).toContain("Enabled");
      expect(document.body.textContent).toContain("Not found");
    },
  );

  test.skipIf(!hasDom)("keeps the loading fallback for invalid response roots", async () => {
    installHooksStatusFetch([]);

    await renderHooksTab();

    expect(document.body.textContent).toContain("Loading hook status…");
  });

  test.skipIf(!hasDom)("keeps the loading fallback when the request rejects", async () => {
    installRejectedHooksStatusFetch();

    await renderHooksTab();

    expect(document.body.textContent).toContain("Loading hook status…");
  });
});
