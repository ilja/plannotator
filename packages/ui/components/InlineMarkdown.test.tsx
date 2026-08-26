import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { InlineMarkdown } from "./InlineMarkdown";

const hasDom = globalThis.document !== undefined;
const realFetch = globalThis.fetch;
const roots: Root[] = [];

function installFetch(responses: Response | Response[]): void {
  const queue = Array.isArray(responses) ? responses : [responses];
  let index = 0;
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => queue[index++] ?? new Response(null, { status: 500 }),
    {
      preconnect: (): void => {},
    },
  );
}

async function mountMarkdown(): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(<InlineMarkdown text="src/example.ts:3" onOpenCodeFile={() => {}} />);
  });
  return host;
}

function getCodeFileLink(host: HTMLDivElement): HTMLElement {
  const link = host.querySelector(".code-file-link");
  if (!(link instanceof HTMLElement)) throw new Error("Code file link did not render");
  return link;
}

async function hoverCodeFile(host: HTMLDivElement): Promise<void> {
  const link = getCodeFileLink(host);
  await act(async () => {
    link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: null }));
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
}

async function leaveCodeFile(host: HTMLDivElement): Promise<void> {
  const link = getCodeFileLink(host);
  await act(async () => {
    link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: null }));
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  globalThis.fetch = realFetch;
  if (hasDom) document.body.innerHTML = "";
});

describe("InlineMarkdown code-file preview response handling", () => {
  test.skipIf(!hasDom)("renders a preview only for a validated response", async () => {
    installFetch(
      new Response(
        JSON.stringify({
          contents: "first line\nsecond line\nthird line",
          filepath: "/repo/src/example.ts",
        }),
      ),
    );
    const host = await mountMarkdown();

    await hoverCodeFile(host);

    expect(document.querySelector(".code-snippet-preview")).not.toBeNull();
    expect(document.body.textContent).toContain("third line");
  });

  test.skipIf(!hasDom)("replaces a malformed preview after a valid retry", async () => {
    installFetch([
      new Response(JSON.stringify({ contents: 42, filepath: "/repo/src/example.ts" })),
      new Response(
        JSON.stringify({
          contents: "first\nsecond\nvalid after retry",
          filepath: "/repo/src/example.ts",
        }),
      ),
    ]);
    const host = await mountMarkdown();

    await hoverCodeFile(host);
    expect(document.querySelector(".code-snippet-preview")).toBeNull();

    await leaveCodeFile(host);
    await hoverCodeFile(host);
    expect(document.querySelector(".code-snippet-preview")).not.toBeNull();
    expect(document.body.textContent).toContain("valid after retry");
  });

  test.skipIf(!hasDom)(
    "silently suppresses malformed, invalid-JSON, and non-OK previews",
    async () => {
      const responses = [
        new Response(JSON.stringify({ contents: 42, filepath: "/repo/src/example.ts" })),
        new Response("{invalid-json"),
        new Response(JSON.stringify({ contents: "untrusted", filepath: "/repo/src/example.ts" }), {
          status: 503,
        }),
      ];

      for (const response of responses) {
        installFetch(response);
        const host = await mountMarkdown();
        await hoverCodeFile(host);
        expect(document.querySelector(".code-snippet-preview")).toBeNull();
        host.remove();
      }
    },
  );
});
