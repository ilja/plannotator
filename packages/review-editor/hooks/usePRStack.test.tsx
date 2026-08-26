import { afterEach, describe, expect, test } from "bun:test";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PRStackCallbacks } from "./usePRStack";
import {
  decodePRDiffScopeError,
  decodePRDiffScopeResponse,
  decodePRSwitchError,
  decodePRSwitchResponse,
  readPRDiffScopeResponse,
  readPRSwitchResponse,
  usePRStack,
} from "./usePRStack";

const hasDom = globalThis.document !== undefined;
const realFetch = globalThis.fetch;
const roots: Root[] = [];

const validLayerResponse = {
  rawPatch: "diff --git a/file.ts b/file.ts",
  gitRef: "main..HEAD",
  prDiffScope: "layer" as const,
  prDiffScopeOptions: [
    { id: "layer" as const, label: "Layer", description: "Layer changes", enabled: true },
    { id: "full-stack" as const, label: "Full stack", description: "All changes", enabled: true },
    { id: "layer", label: "invalid", description: "invalid", enabled: "yes" },
  ],
  prPatchIncomplete: true,
  prPatchUpgradeAvailable: false,
  error: "A non-fatal warning",
  semanticDiff: { available: true, semVersion: "1.0.0", semSource: "local" },
  viewedFiles: ["file.ts", 42],
};

const validFullStackResponse = {
  rawPatch: "full diff",
  gitRef: "main..HEAD",
  prDiffScope: "full-stack" as const,
};

const validGithubPRResponse = {
  rawPatch: "diff --git a/file.ts b/file.ts",
  gitRef: "main..feature/review",
  prMetadata: {
    platform: "github" as const,
    host: "github.com",
    owner: "backnotprop",
    repo: "plannotator",
    number: 42,
    title: "Safe response decoding",
    author: "ilja",
    baseBranch: "main",
    headBranch: "feature/review",
    baseSha: "base-sha",
    headSha: "head-sha",
    url: "https://github.com/backnotprop/plannotator/pull/42",
  },
  prStackInfo: {
    isStacked: true,
    baseBranch: "main",
    label: "feature/review",
    source: "branch-inferred" as const,
  },
  prStackTree: {
    nodes: [
      {
        branch: "feature/review",
        isCurrent: true,
        isDefaultBranch: false,
      },
    ],
  },
  prDiffScope: "layer" as const,
  prDiffScopeOptions: [
    {
      id: "layer" as const,
      label: "Layer",
      description: "Changes in this PR",
      enabled: true,
    },
  ],
  prPatchIncomplete: true,
  prPatchUpgradeAvailable: false,
  repoInfo: { display: "backnotprop/plannotator", branch: "feature/review" },
  viewedFiles: ["file.ts"],
  agentCwd: "/tmp/pr-42",
  semanticDiff: { available: true, semVersion: "1.0.0", semSource: "local" },
  error: "A non-fatal warning",
};

const validGitlabPRResponse = {
  ...validGithubPRResponse,
  gitRef: "main..feature/mr-42",
  prMetadata: {
    platform: "gitlab" as const,
    host: "gitlab.com",
    projectPath: "backnotprop/plannotator",
    iid: 42,
    title: "Safe response decoding",
    author: "ilja",
    baseBranch: "main",
    headBranch: "feature/mr-42",
    baseSha: "base-sha",
    headSha: "head-sha",
    url: "https://gitlab.com/backnotprop/plannotator/-/merge_requests/42",
  },
};

const validCachedPRResponse = {
  rawPatch: "cached diff",
  gitRef: "cached-ref",
  prMetadata: validGithubPRResponse.prMetadata,
};

function installFetch(responses: Response[]): void {
  let index = 0;
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => responses[index++] ?? responses[responses.length - 1],
    { preconnect: (): void => {} },
  );
}

function HookHarness({
  applied,
  errors,
}: {
  applied: unknown[];
  errors: string[];
}): React.JSX.Element {
  const callbacksRef = useRef<PRStackCallbacks>({
    applyPRResponse: (data) => applied.push(data),
    onError: (message) => errors.push(message),
  });
  const {
    handleScopeSelect,
    handleLoadFullDiff,
    handlePRSwitch,
    isSwitchingPRScope,
    isLoadingFullDiff,
  } = usePRStack(callbacksRef);

  return (
    <div>
      <button
        type="button"
        data-action="scope"
        onClick={() => void handleScopeSelect("full-stack")}
      >
        Scope
      </button>
      <button type="button" data-action="full" onClick={() => void handleLoadFullDiff()}>
        Full
      </button>
      <button
        type="button"
        data-action="pr-switch"
        onClick={() => void handlePRSwitch("https://github.com/backnotprop/plannotator/pull/42")}
      >
        PR switch
      </button>
      <output
        data-switching={String(isSwitchingPRScope)}
        data-loading-full={String(isLoadingFullDiff)}
      />
    </div>
  );
}

async function renderHarness(applied: unknown[], errors: string[]): Promise<void> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(<HookHarness applied={applied} errors={errors} />);
    await Promise.resolve();
  });
}

async function clickAction(action: "scope" | "full" | "pr-switch"): Promise<HTMLOutputElement> {
  const button = document.querySelector(`[data-action="${action}"]`);
  const output = document.querySelector("output");
  if (!(button instanceof HTMLButtonElement) || !(output instanceof HTMLOutputElement)) {
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

describe("decodePRSwitchResponse", () => {
  test("decodes valid GitHub and GitLab responses", () => {
    expect(decodePRSwitchResponse(validGithubPRResponse)).toMatchObject(validGithubPRResponse);
    expect(decodePRSwitchResponse(validGitlabPRResponse)).toMatchObject(validGitlabPRResponse);
  });

  test("accepts a minimal cached response with only required fields", () => {
    expect(decodePRSwitchResponse(validCachedPRResponse)).toEqual(validCachedPRResponse);
  });

  test("rejects missing or malformed required fields", () => {
    for (const value of [
      null,
      [],
      {},
      { ...validGithubPRResponse, rawPatch: undefined },
      { ...validGithubPRResponse, rawPatch: 42 },
      { ...validGithubPRResponse, gitRef: undefined },
      { ...validGithubPRResponse, gitRef: null },
      { ...validGithubPRResponse, prMetadata: undefined },
      {
        ...validGithubPRResponse,
        prMetadata: { ...validGithubPRResponse.prMetadata, number: "42" },
      },
      {
        ...validGithubPRResponse,
        prMetadata: { ...validGithubPRResponse.prMetadata, platform: "gitlab" },
      },
    ]) {
      expect(decodePRSwitchResponse(value)).toBeUndefined();
    }
  });

  test("retains valid optional fields while filtering malformed siblings", () => {
    const decoded = decodePRSwitchResponse({
      ...validGithubPRResponse,
      prDiffScopeOptions: [
        validGithubPRResponse.prDiffScopeOptions[0],
        { id: "layer", label: "invalid", description: "invalid", enabled: "yes" },
      ],
      viewedFiles: ["file.ts", 42],
      repoInfo: { display: "backnotprop/plannotator", branch: 42 },
      semanticDiff: { available: "yes" },
      prStackInfo: { ...validGithubPRResponse.prStackInfo, source: "invalid" },
      prStackTree: { nodes: [{ branch: "invalid" }] },
      error: 42,
    });

    expect(decoded).toMatchObject({
      rawPatch: validGithubPRResponse.rawPatch,
      gitRef: validGithubPRResponse.gitRef,
      prMetadata: validGithubPRResponse.prMetadata,
      prDiffScope: validGithubPRResponse.prDiffScope,
      prDiffScopeOptions: validGithubPRResponse.prDiffScopeOptions,
      prPatchIncomplete: true,
      prPatchUpgradeAvailable: false,
      repoInfo: { display: validGithubPRResponse.repoInfo.display },
      viewedFiles: validGithubPRResponse.viewedFiles,
      agentCwd: validGithubPRResponse.agentCwd,
    });
    expect(decoded).not.toHaveProperty("semanticDiff");
    expect(decoded).not.toHaveProperty("prStackInfo");
    expect(decoded).not.toHaveProperty("prStackTree");
    expect(decoded).not.toHaveProperty("error");
  });
});

describe("decodePRSwitchError", () => {
  test("reads only a string error field", () => {
    expect(decodePRSwitchError({ error: "Permission denied" })).toBe("Permission denied");
    expect(decodePRSwitchError({ error: "" })).toBe("");
    expect(decodePRSwitchError({ error: { message: "untrusted" } })).toBeUndefined();
    expect(decodePRSwitchError({ error: 42 })).toBeUndefined();
    expect(decodePRSwitchError(null)).toBeUndefined();
  });
});

describe("readPRSwitchResponse", () => {
  test("reads a valid successful response", async () => {
    await expect(
      readPRSwitchResponse(
        new Response(JSON.stringify(validGithubPRResponse), { status: 200 }),
        "Failed to switch PR",
      ),
    ).resolves.toMatchObject({ prMetadata: validGithubPRResponse.prMetadata });
  });

  test("falls back for invalid JSON and malformed successful responses", async () => {
    await expect(
      readPRSwitchResponse(new Response("{invalid-json", { status: 200 }), "Failed to switch PR"),
    ).rejects.toThrow("Invalid PR switch response");
    await expect(
      readPRSwitchResponse(
        new Response(JSON.stringify({ ...validGithubPRResponse, prMetadata: undefined }), {
          status: 200,
        }),
        "Failed to switch PR",
      ),
    ).rejects.toThrow("Invalid PR switch response");
  });

  test("uses only a string error from non-OK responses", async () => {
    await expect(
      readPRSwitchResponse(
        new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
        "Failed to switch PR",
      ),
    ).rejects.toThrow("Permission denied");
    await expect(
      readPRSwitchResponse(
        new Response(JSON.stringify({ error: { message: "untrusted" } }), { status: 503 }),
        "Failed to switch PR",
      ),
    ).rejects.toThrow("Failed to switch PR");
    await expect(
      readPRSwitchResponse(new Response("{invalid-json", { status: 502 }), "Failed to switch PR"),
    ).rejects.toThrow("Failed to switch PR");
  });
});

describe("decodePRDiffScopeResponse", () => {
  test("decodes both supported scopes", () => {
    expect(decodePRDiffScopeResponse(validLayerResponse)).toMatchObject({
      rawPatch: validLayerResponse.rawPatch,
      gitRef: validLayerResponse.gitRef,
      prDiffScope: "layer",
    });
    expect(decodePRDiffScopeResponse(validFullStackResponse)).toEqual(validFullStackResponse);
  });

  test("rejects missing or malformed required fields", () => {
    for (const value of [
      null,
      [],
      {},
      { ...validLayerResponse, rawPatch: undefined },
      { ...validLayerResponse, rawPatch: 42 },
      { ...validLayerResponse, gitRef: undefined },
      { ...validLayerResponse, gitRef: null },
      { ...validLayerResponse, prDiffScope: undefined },
      { ...validLayerResponse, prDiffScope: "unknown" },
      { ...validLayerResponse, prDiffScope: 42 },
    ]) {
      expect(decodePRDiffScopeResponse(value)).toBeUndefined();
    }
  });

  test("filters malformed optional array members and retains valid siblings", () => {
    const decoded = decodePRDiffScopeResponse(validLayerResponse);

    expect(decoded).toMatchObject({
      rawPatch: validLayerResponse.rawPatch,
      gitRef: validLayerResponse.gitRef,
      prDiffScope: validLayerResponse.prDiffScope,
      prDiffScopeOptions: validLayerResponse.prDiffScopeOptions.slice(0, 2),
      prPatchIncomplete: true,
      prPatchUpgradeAvailable: false,
      error: validLayerResponse.error,
      semanticDiff: validLayerResponse.semanticDiff,
      viewedFiles: ["file.ts"],
    });
  });
});

describe("decodePRDiffScopeError", () => {
  test("trusts only a string error field", () => {
    expect(decodePRDiffScopeError({ error: "Permission denied" })).toBe("Permission denied");
    expect(decodePRDiffScopeError({ error: "" })).toBe("");
    expect(decodePRDiffScopeError({ error: { message: "untrusted" } })).toBeUndefined();
    expect(decodePRDiffScopeError({ error: 42 })).toBeUndefined();
    expect(decodePRDiffScopeError(null)).toBeUndefined();
  });
});

describe("readPRDiffScopeResponse", () => {
  test("resolves valid successful responses", async () => {
    await expect(
      readPRDiffScopeResponse(
        new Response(JSON.stringify(validLayerResponse), { status: 200 }),
        "Failed to switch PR diff scope",
      ),
    ).resolves.toMatchObject({ prDiffScope: "layer" });
  });

  test("rejects invalid JSON and malformed successful bodies", async () => {
    await expect(
      readPRDiffScopeResponse(
        new Response("{invalid-json", { status: 200 }),
        "Failed to switch PR diff scope",
      ),
    ).rejects.toThrow();
    await expect(
      readPRDiffScopeResponse(
        new Response(JSON.stringify({ rawPatch: "patch", gitRef: "ref" }), { status: 200 }),
        "Failed to switch PR diff scope",
      ),
    ).rejects.toThrow();
  });

  test("uses only a string error from non-OK responses", async () => {
    await expect(
      readPRDiffScopeResponse(
        new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
        "Failed to switch PR diff scope",
      ),
    ).rejects.toThrow("Permission denied");
    await expect(
      readPRDiffScopeResponse(
        new Response(JSON.stringify({ error: { message: "untrusted" } }), { status: 503 }),
        "Failed to switch PR diff scope",
      ),
    ).rejects.toThrow("Failed to switch PR diff scope");
    await expect(
      readPRDiffScopeResponse(
        new Response("{invalid-json", { status: 502 }),
        "Failed to load the full diff",
      ),
    ).rejects.toThrow("Failed to load the full diff");
  });
});

describe("usePRStack response handling", () => {
  test.skipIf(!hasDom)(
    "validates GitHub and GitLab PR switch responses while preserving loading completion",
    async () => {
      const applied: unknown[] = [];
      const errors: string[] = [];
      installFetch([
        new Response(JSON.stringify(validGithubPRResponse), { status: 200 }),
        new Response(JSON.stringify(validGitlabPRResponse), { status: 200 }),
      ]);
      await renderHarness(applied, errors);

      const firstOutput = await clickAction("pr-switch");
      expect(firstOutput.dataset.switching).toBe("false");
      expect(applied).toHaveLength(1);
      expect(applied[0]).toMatchObject({
        gitRef: validGithubPRResponse.gitRef,
        prMetadata: { platform: "github", number: 42 },
      });

      const secondOutput = await clickAction("pr-switch");
      expect(secondOutput.dataset.switching).toBe("false");
      expect(applied).toHaveLength(2);
      expect(applied[1]).toMatchObject({
        gitRef: validGitlabPRResponse.gitRef,
        prMetadata: { platform: "gitlab", iid: 42 },
      });
      expect(errors).toEqual([]);
    },
  );

  test.skipIf(!hasDom)(
    "routes malformed PR switch responses and invalid JSON to onError",
    async () => {
      const applied: unknown[] = [];
      const errors: string[] = [];
      installFetch([
        new Response(JSON.stringify({ ...validGithubPRResponse, prMetadata: undefined }), {
          status: 200,
        }),
        new Response("{invalid-json", { status: 200 }),
      ]);
      await renderHarness(applied, errors);

      const firstOutput = await clickAction("pr-switch");
      expect(firstOutput.dataset.switching).toBe("false");
      expect(errors).toEqual(["Invalid PR switch response"]);

      const secondOutput = await clickAction("pr-switch");
      expect(secondOutput.dataset.switching).toBe("false");
      expect(errors).toEqual(["Invalid PR switch response", "Invalid PR switch response"]);
      expect(applied).toEqual([]);
    },
  );

  test.skipIf(!hasDom)("uses trusted and fallback messages for PR switch errors", async () => {
    const applied: unknown[] = [];
    const errors: string[] = [];
    installFetch([
      new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
      new Response(JSON.stringify({ error: { message: "untrusted" } }), { status: 503 }),
      new Response("{invalid-json", { status: 502 }),
    ]);
    await renderHarness(applied, errors);

    await clickAction("pr-switch");
    await clickAction("pr-switch");
    await clickAction("pr-switch");

    expect(errors).toEqual(["Permission denied", "Failed to switch PR", "Failed to switch PR"]);
    expect(applied).toEqual([]);
  });

  test.skipIf(!hasDom)(
    "validates scope select and full-diff responses while preserving loading completion",
    async () => {
      const applied: unknown[] = [];
      const errors: string[] = [];
      installFetch([
        new Response(JSON.stringify(validFullStackResponse), { status: 200 }),
        new Response(JSON.stringify(validLayerResponse), { status: 200 }),
      ]);
      await renderHarness(applied, errors);

      const scopeOutput = await clickAction("scope");
      expect(scopeOutput.dataset.switching).toBe("false");
      expect(applied).toHaveLength(1);
      expect(applied[0]).toMatchObject({ prDiffScope: "full-stack" });

      const fullOutput = await clickAction("full");
      expect(fullOutput.dataset.loadingFull).toBe("false");
      expect(applied).toHaveLength(2);
      expect(applied[1]).toMatchObject({
        prDiffScope: "layer",
        rawPatch: validLayerResponse.rawPatch,
      });
      expect(errors).toEqual([]);
    },
  );

  test.skipIf(!hasDom)(
    "routes malformed successful responses and invalid JSON to onError",
    async () => {
      const applied: unknown[] = [];
      const errors: string[] = [];
      installFetch([
        new Response(JSON.stringify({ rawPatch: "patch", gitRef: "ref", prDiffScope: "bad" }), {
          status: 200,
        }),
        new Response("{invalid-json", { status: 200 }),
      ]);
      await renderHarness(applied, errors);

      const firstOutput = await clickAction("scope");
      expect(firstOutput.dataset.switching).toBe("false");
      expect(errors).toHaveLength(1);

      const secondOutput = await clickAction("scope");
      expect(secondOutput.dataset.switching).toBe("false");
      expect(errors).toHaveLength(2);
      expect(applied).toEqual([]);
    },
  );

  test.skipIf(!hasDom)(
    "uses trusted and fallback messages for non-OK error envelopes",
    async () => {
      const applied: unknown[] = [];
      const errors: string[] = [];
      installFetch([
        new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }),
        new Response(JSON.stringify({ error: { message: "untrusted" } }), { status: 503 }),
        new Response("{invalid-json", { status: 502 }),
      ]);
      await renderHarness(applied, errors);

      const trustedOutput = await clickAction("scope");
      expect(trustedOutput.dataset.switching).toBe("false");
      expect(errors).toEqual(["Permission denied"]);

      const malformedOutput = await clickAction("scope");
      expect(malformedOutput.dataset.switching).toBe("false");
      expect(errors).toEqual(["Permission denied", "Failed to switch PR diff scope"]);

      const invalidJsonOutput = await clickAction("full");
      expect(invalidJsonOutput.dataset.loadingFull).toBe("false");
      expect(errors).toEqual([
        "Permission denied",
        "Failed to switch PR diff scope",
        "Failed to load the full diff",
      ]);
      expect(applied).toEqual([]);
    },
  );
});
