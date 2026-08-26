import { afterEach, describe, expect, test } from "bun:test";
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PRSelector } from "./PRSelector";

const hasDom = globalThis.document !== undefined;
const originalFetch = globalThis.fetch;

const validPullRequest = {
  id: "pr-42",
  number: 42,
  title: "Ship safe PR list decoding",
  author: "ilja",
  url: "https://github.com/backnotprop/plannotator/pull/42",
  state: "open",
};

function mockPRListResponse<Input>(body: Input): void {
  globalThis.fetch = async () => new Response(JSON.stringify(body));
}

async function mountPRSelector() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root!: Root;

  await act(async () => {
    root = createRoot(host);
    root.render(
      <PRSelector
        prNumberLabel="#42"
        prTitle="Current pull request"
        currentNumber={42}
        onSelect={() => {}}
      />,
    );
  });

  return {
    host,
    open: async () => {
      const trigger = host.querySelector<HTMLButtonElement>('button[title="Current pull request"]');
      await act(async () => {
        trigger?.click();
        await Promise.resolve();
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (hasDom) document.body.innerHTML = "";
});

describe("PRSelector", () => {
  test.skipIf(!hasDom)("renders a valid PR list response", async () => {
    mockPRListResponse({
      prs: [
        validPullRequest,
        {
          ...validPullRequest,
          id: "pr-7",
          number: 7,
          title: "Earlier pull request",
          state: "merged",
        },
      ],
    });
    const session = await mountPRSelector();

    await session.open();

    expect(document.body.textContent).toContain("Ship safe PR list decoding");
    expect(document.body.textContent).toContain("Earlier pull request");
    await session.unmount();
  });

  test.skipIf(!hasDom)(
    "uses the existing empty-list fallback for a malformed envelope",
    async () => {
      mockPRListResponse(null);
      const session = await mountPRSelector();

      await session.open();

      expect(document.body.textContent).toContain("No pull requests found");
      await session.unmount();
    },
  );

  test.skipIf(!hasDom)("renders only valid PRs from a mixed list in source order", async () => {
    mockPRListResponse({
      prs: [
        { ...validPullRequest, id: "pr-3", number: 3, title: "First valid pull request" },
        {
          ...validPullRequest,
          id: "pr-invalid",
          number: "not-a-number",
          title: "Invalid pull request",
        },
        {
          ...validPullRequest,
          id: "pr-1",
          number: 1,
          title: "Second valid pull request",
          state: "closed",
        },
      ],
    });
    const session = await mountPRSelector();

    await session.open();

    const content = document.body.textContent ?? "";
    expect(content).toContain("First valid pull request");
    expect(content).not.toContain("Invalid pull request");
    expect(content).toContain("Second valid pull request");
    expect(content.indexOf("First valid pull request")).toBeLessThan(
      content.indexOf("Second valid pull request"),
    );
    await session.unmount();
  });
});
