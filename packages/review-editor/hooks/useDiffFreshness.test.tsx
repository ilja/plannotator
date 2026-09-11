import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDiffFreshness } from "./useDiffFreshness";

const hasDom = globalThis.document !== undefined;

const realFetch = globalThis.fetch;

const realSetTimeout = globalThis.setTimeout;

const realClearTimeout = globalThis.clearTimeout;

const roots: Root[] = [];

const timerCallbacks = new Map<number, () => void>();

let nextTimerId = 1;

function installManualTimers(): void {
  Object.defineProperty(globalThis, "setTimeout", {
    configurable: true,
    value: (callback: () => void): number => {
      const id = nextTimerId++;
      timerCallbacks.set(id, callback);

      return id;
    },
  });
  Object.defineProperty(globalThis, "clearTimeout", {
    configurable: true,
    value: (id: number): void => {
      timerCallbacks.delete(id);
    },
  });
}

function runNextTimer(): void {
  const next = timerCallbacks.entries().next();

  if (next.done) throw new Error("Expected a pending timer");
  timerCallbacks.delete(next.value[0]);
  next.value[1]();
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function installFetch(responses: Array<Response | Promise<Response>>): void {
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => responses.shift() ?? new Response(null, { status: 500 }),
    { preconnect: (): void => {} },
  );
}

interface HookHarnessProps {
  resetKey: string;
  appliedCwds: Array<string | null>;
}

function HookHarness({ resetKey, appliedCwds }: HookHarnessProps): React.JSX.Element {
  const freshness = useDiffFreshness({
    enabled: true,
    resetKey,
    onAgentCwd: (cwd) => appliedCwds.push(cwd),
  });

  return (
    <div>
      <output data-stale={String(freshness.isStale)} />
      <button type="button" onClick={freshness.dismiss}>
        Dismiss
      </button>
    </div>
  );
}

async function mountHarness(
  resetKey: string,
  appliedCwds: Array<string | null>,
): Promise<{ host: HTMLDivElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(<HookHarness resetKey={resetKey} appliedCwds={appliedCwds} />);
    await flushAsyncWork();
  });

  return { host, root };
}

function staleOutput(host: HTMLDivElement): HTMLOutputElement {
  const output = host.querySelector("output");

  if (!(output instanceof HTMLOutputElement)) throw new Error("Hook harness did not render");

  return output;
}

async function runPoll(host: HTMLDivElement): Promise<void> {
  await act(async () => {
    runNextTimer();
    await flushAsyncWork();
  });
  expect(staleOutput(host)).toBeDefined();
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }

  globalThis.fetch = realFetch;
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: realSetTimeout });
  Object.defineProperty(globalThis, "clearTimeout", {
    configurable: true,
    value: realClearTimeout,
  });
  timerCallbacks.clear();

  if (hasDom) document.body.innerHTML = "";
});

describe("useDiffFreshness response handling", () => {
  test.skipIf(!hasDom)("applies valid stale and fresh responses", async () => {
    installManualTimers();
    installFetch([
      new Response(
        JSON.stringify({ fresh: false, fingerprint: "abc123", agentCwd: "/tmp/review" }),
      ),
      new Response(JSON.stringify({ fresh: true, agentCwd: null })),
    ]);
    const appliedCwds: Array<string | null> = [];
    const { host } = await mountHarness("snapshot", appliedCwds);

    await runPoll(host);
    expect(staleOutput(host).dataset.stale).toBe("true");
    expect(appliedCwds).toEqual(["/tmp/review"]);

    await runPoll(host);
    expect(staleOutput(host).dataset.stale).toBe("false");
    expect(appliedCwds).toEqual(["/tmp/review", null]);
  });

  test.skipIf(!hasDom)("omits optional metadata without clearing staleness", async () => {
    installManualTimers();
    installFetch([
      new Response(JSON.stringify({ fresh: false })),
      new Response(JSON.stringify({ fresh: false })),
    ]);
    const appliedCwds: Array<string | null> = [];
    const { host } = await mountHarness("snapshot", appliedCwds);

    await runPoll(host);
    expect(staleOutput(host).dataset.stale).toBe("true");

    const dismiss = host.querySelector("button");

    if (!(dismiss instanceof HTMLButtonElement)) throw new Error("Hook harness did not render");
    await act(async () => dismiss.click());
    expect(staleOutput(host).dataset.stale).toBe("false");

    await runPoll(host);
    expect(staleOutput(host).dataset.stale).toBe("false");
  });

  test.skipIf(!hasDom)("keeps staleness after an invalid JSON poll", async () => {
    installManualTimers();
    installFetch([new Response(JSON.stringify({ fresh: false })), new Response("{invalid-json")]);
    const appliedCwds: Array<string | null> = [];
    const { host } = await mountHarness("snapshot", appliedCwds);

    await runPoll(host);
    expect(staleOutput(host).dataset.stale).toBe("true");

    await runPoll(host);
    expect(staleOutput(host).dataset.stale).toBe("true");
  });

  test.skipIf(!hasDom)("ignores non-OK responses", async () => {
    installManualTimers();
    installFetch([
      new Response(JSON.stringify({ fresh: false, fingerprint: "abc123" })),
      new Response(JSON.stringify({ fresh: true }), { status: 503 }),
    ]);
    const appliedCwds: Array<string | null> = [];
    const { host } = await mountHarness("snapshot", appliedCwds);

    await runPoll(host);
    expect(staleOutput(host).dataset.stale).toBe("true");
    await runPoll(host);
    expect(staleOutput(host).dataset.stale).toBe("true");
  });

  test.skipIf(!hasDom)("does not apply a cancelled poll after a reset", async () => {
    installManualTimers();

    let resolveFirst: (response: Response) => void = () => {
      throw new Error("First response resolver was not initialized");
    };

    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    installFetch([
      firstResponse,
      new Response(JSON.stringify({ fresh: false, fingerprint: "new", agentCwd: "/tmp/new" })),
    ]);
    const appliedCwds: Array<string | null> = [];
    const { host, root } = await mountHarness("old-snapshot", appliedCwds);

    await act(async () => {
      runNextTimer();
      await Promise.resolve();
    });

    await act(async () => {
      root.render(<HookHarness resetKey="new-snapshot" appliedCwds={appliedCwds} />);
      await flushAsyncWork();
    });
    await runPoll(host);
    expect(staleOutput(host).dataset.stale).toBe("true");
    expect(appliedCwds).toEqual(["/tmp/new"]);

    const dismiss = host.querySelector("button");

    if (!(dismiss instanceof HTMLButtonElement)) throw new Error("Hook harness did not render");
    await act(async () => dismiss.click());
    expect(staleOutput(host).dataset.stale).toBe("false");

    resolveFirst(
      new Response(JSON.stringify({ fresh: false, fingerprint: "old", agentCwd: "/tmp/old" })),
    );
    await act(async () => flushAsyncWork());
    expect(staleOutput(host).dataset.stale).toBe("false");
    expect(appliedCwds).toEqual(["/tmp/new"]);
  });
});
