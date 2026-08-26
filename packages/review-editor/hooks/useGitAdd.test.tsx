import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useGitAdd } from "./useGitAdd";

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

function installFetch(
  responses: Array<Response | Promise<Response>>,
  requestBodies?: Array<BodyInit | null | undefined>,
): void {
  globalThis.fetch = Object.assign(
    async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requestBodies?.push(init?.body);
      return responses.shift() ?? new Response(null, { status: 500 });
    },
    { preconnect: (): void => {} },
  );
}

function HookHarness({ viewedFiles }: { viewedFiles: string[] }): React.JSX.Element {
  const { stagedFiles, stagingFile, stageFile, stageError, canStageFiles } = useGitAdd({
    activeDiffBase: "unstaged",
    onFileViewed: (filePath) => viewedFiles.push(filePath),
  });

  return (
    <div>
      <button type="button" onClick={() => void stageFile("file.ts")}>
        Stage
      </button>
      <output
        data-can-stage={String(canStageFiles)}
        data-staged={String(stagedFiles.has("file.ts"))}
        data-staging={stagingFile ?? ""}
        data-error={stageError ?? ""}
      />
    </div>
  );
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mountHarness(viewedFiles: string[]): Promise<HTMLDivElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(<HookHarness viewedFiles={viewedFiles} />);
    await flushAsyncWork();
  });

  return host;
}

function getOutput(host: HTMLDivElement): HTMLOutputElement {
  const output = host.querySelector("output");
  if (!(output instanceof HTMLOutputElement)) throw new Error("Hook harness did not render");
  return output;
}

async function clickStage(host: HTMLDivElement): Promise<void> {
  const button = host.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) throw new Error("Hook harness did not render");

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
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: realSetTimeout });
  Object.defineProperty(globalThis, "clearTimeout", {
    configurable: true,
    value: realClearTimeout,
  });
  timerCallbacks.clear();
  if (hasDom) document.body.innerHTML = "";
});

describe("useGitAdd response handling", () => {
  test.skipIf(!hasDom)("stages and undoes a file while only staging marks it viewed", async () => {
    installManualTimers();
    const requestBodies: Array<BodyInit | null | undefined> = [];
    installFetch(
      [
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ],
      requestBodies,
    );
    const viewedFiles: string[] = [];
    const host = await mountHarness(viewedFiles);

    expect(getOutput(host).dataset.canStage).toBe("true");
    await clickStage(host);
    expect(getOutput(host).dataset.staged).toBe("true");
    expect(getOutput(host).dataset.staging).toBe("");
    expect(requestBodies[0]).toBe(JSON.stringify({ filePath: "file.ts", undo: false }));
    expect(viewedFiles).toEqual(["file.ts"]);

    await clickStage(host);
    expect(getOutput(host).dataset.staged).toBe("false");
    expect(getOutput(host).dataset.staging).toBe("");
    expect(requestBodies[1]).toBe(JSON.stringify({ filePath: "file.ts", undo: true }));
    expect(viewedFiles).toEqual(["file.ts"]);
  });

  test.skipIf(!hasDom)("keeps loading state until the response is read", async () => {
    installManualTimers();
    let resolveResponse: (response: Response) => void = () => {
      throw new Error("Response resolver was not initialized");
    };
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    installFetch([response]);
    const viewedFiles: string[] = [];
    const host = await mountHarness(viewedFiles);

    const button = host.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) throw new Error("Hook harness did not render");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(getOutput(host).dataset.staging).toBe("file.ts");

    resolveResponse(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await act(async () => flushAsyncWork());
    expect(getOutput(host).dataset.staging).toBe("");
    expect(getOutput(host).dataset.staged).toBe("true");
  });

  test.skipIf(!hasDom)("keeps state unchanged and uses trusted or fallback errors", async () => {
    installManualTimers();
    installFetch([
      new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
      new Response(JSON.stringify({ ok: false }), { status: 200 }),
      new Response(JSON.stringify({ error: 42 }), { status: 500 }),
    ]);
    const viewedFiles: string[] = [];
    const host = await mountHarness(viewedFiles);

    await clickStage(host);
    expect(getOutput(host).dataset.error).toBe("Permission denied");
    expect(getOutput(host).dataset.staged).toBe("false");

    await clickStage(host);
    expect(getOutput(host).dataset.error).toBe("Failed");
    expect(getOutput(host).dataset.staged).toBe("false");

    await clickStage(host);
    expect(getOutput(host).dataset.error).toBe("Failed");
    expect(getOutput(host).dataset.staged).toBe("false");
    expect(viewedFiles).toEqual([]);

    await act(async () => {
      runNextTimer();
      await Promise.resolve();
    });
    expect(getOutput(host).dataset.error).toBe("");
  });
});
