import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAgentReviewActions, type AgentReviewActions } from "./useAgentReviewActions";

const hasDom = globalThis.document !== undefined;

const realFetch = globalThis.fetch;

const roots: Root[] = [];

let latest: AgentReviewActions | null = null;

const submitted: Array<"approved" | "feedback" | "exited"> = [];

const feedbackStatuses: Array<string | null> = [];

function HookHarness({ count }: { count: number }): React.JSX.Element {
  latest = useAgentReviewActions({
    allAnnotations: [],
    editorAnnotations: [],
    feedbackMarkdown: "looks good",
    totalAnnotationCount: count,
    getDraftGeneration: () => 1,
    onSubmitted: (submission) => submitted.push(submission),
    onFeedbackStatusChange: (status) => feedbackStatuses.push(status),
    onNoAnnotations: () => {},
  });

  return (
    <div>
      <button type="button" onClick={() => void latest?.sendFeedback()}>
        Send
      </button>
      <button type="button" onClick={() => void latest?.approveReview()}>
        Approve
      </button>
      <button type="button" onClick={() => void latest?.exitReview()}>
        Exit
      </button>
      <output
        data-sending={String(latest.isSendingFeedback)}
        data-approving={String(latest.isApproving)}
        data-exiting={String(latest.isExiting)}
      />
    </div>
  );
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mountHarness(count: number): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(<HookHarness count={count} />);
    await flushAsyncWork();
  });

  return host;
}

function getOutput(host: HTMLDivElement): HTMLOutputElement {
  const output = host.querySelector("output");

  if (!(output instanceof HTMLOutputElement)) throw new Error("Hook harness did not render");

  return output;
}

async function click(host: HTMLDivElement, label: string): Promise<void> {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent === label);

  if (!button) throw new Error(`Button ${label} did not render`);

  await act(async () => {
    button.click();
    await flushAsyncWork();
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }

  globalThis.fetch = realFetch;
  submitted.length = 0;
  feedbackStatuses.length = 0;
  latest = null;
});

describe("useAgentReviewActions pending action", () => {
  test("a failed send clears the pending flag", async () => {
    if (!hasDom) return;

    globalThis.fetch = Object.assign(async () => new Response(null, { status: 500 }), {
      preconnect: (): void => {},
    });

    const host = await mountHarness(1);
    await click(host, "Send");

    const output = getOutput(host);
    expect(output.dataset.sending).toBe("false");
    expect(output.dataset.approving).toBe("false");
    expect(output.dataset.exiting).toBe("false");
    expect(submitted).toEqual([]);
  });

  test("a second action while one is pending leaves exactly one flag set", async () => {
    if (!hasDom) return;

    let release!: () => void;

    const gate = new Promise<Response>((resolve) => {
      release = () => resolve(new Response(null, { status: 200 }));
    });

    globalThis.fetch = Object.assign(async () => gate, { preconnect: (): void => {} });

    const host = await mountHarness(1);
    await click(host, "Send");

    expect(getOutput(host).dataset.sending).toBe("true");

    await click(host, "Approve");

    // The union holds one action: two pending flags are unrepresentable.
    const output = getOutput(host);

    const pending = [
      output.dataset.sending,
      output.dataset.approving,
      output.dataset.exiting,
    ].filter((flag) => flag === "true");

    expect(pending).toHaveLength(1);

    await act(async () => {
      release();
      await flushAsyncWork();
    });
  });

  test.skipIf(!hasDom)(
    "a rejected approve clears the pending flag without submitting",
    async () => {
      let reject!: (cause: unknown) => void;

      const gate = new Promise<Response>((_resolve, rejectFn) => {
        reject = rejectFn;
      });

      globalThis.fetch = Object.assign(async () => gate, { preconnect: (): void => {} });

      const host = await mountHarness(1);
      await click(host, "Approve");

      expect(getOutput(host).dataset.approving).toBe("true");

      await act(async () => {
        reject(new Error("network down"));
        await flushAsyncWork();
      });

      const output = getOutput(host);
      expect(output.dataset.sending).toBe("false");
      expect(output.dataset.approving).toBe("false");
      expect(output.dataset.exiting).toBe("false");
      expect(submitted).toEqual([]);
      expect(feedbackStatuses).toEqual(["Failed to send"]);
    },
  );

  test.skipIf(!hasDom)("a failed exit clears the pending flag without submitting", async () => {
    let release!: (response: Response) => void;

    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });

    globalThis.fetch = Object.assign(async () => gate, { preconnect: (): void => {} });

    const host = await mountHarness(1);
    await click(host, "Exit");

    expect(getOutput(host).dataset.exiting).toBe("true");

    await act(async () => {
      release(new Response(null, { status: 500 }));
      await flushAsyncWork();
    });

    const output = getOutput(host);
    expect(output.dataset.sending).toBe("false");
    expect(output.dataset.approving).toBe("false");
    expect(output.dataset.exiting).toBe("false");
    expect(submitted).toEqual([]);
  });
});
