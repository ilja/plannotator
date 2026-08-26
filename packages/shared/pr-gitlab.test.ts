import { describe, expect, spyOn, test } from "bun:test";
import { Schema } from "effect";
import { fetchGlMR, fetchGlMRContext, getGlUser, submitGlMRReview } from "./pr-gitlab";
import type { PRRuntime } from "./pr-types";

describe("fetchGlMR", () => {
  test("uses GitLab raw diffs so binary markers and collapsed files are preserved", async () => {
    const calls: string[] = [];
    const rawPatch = [
      "diff --git a/src/app.ts b/src/app.ts",
      "index 0000000000000000000000000000000000000000..1111111111111111111111111111111111111111 100644",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -0,0 +1,3 @@",
      "+export function created() {",
      "+  return true;",
      "+}",
      "diff --git a/package-lock.json b/package-lock.json",
      "index 2222222222222222222222222222222222222222..3333333333333333333333333333333333333333 100644",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1,3 +1,3 @@",
      "-  \"old\": true",
      "+  \"new\": true",
      "diff --git a/tests/snap.png b/tests/snap.png",
      "new file mode 100644",
      "index 0000000000000000000000000000000000000000..4444444444444444444444444444444444444444",
      "Binary files /dev/null and b/tests/snap.png differ",
      "",
    ].join("\n");

    const runtime: PRRuntime = {
      async runCommand(command, args) {
        calls.push([command, ...args].join(" "));
        const endpoint = args[1];
        if (endpoint === "projects/group%2Fproject/merge_requests/42/raw_diffs") {
          return {
            stdout: rawPatch,
            stderr: "",
            exitCode: 0,
          };
        }
        if (endpoint === "projects/group%2Fproject/merge_requests/42") {
          return {
            stdout: JSON.stringify({
              title: "Add app",
              author: { username: "reviewer" },
              source_branch: "feature/app",
              target_branch: "main",
              diff_refs: {
                base_sha: "a".repeat(40),
                head_sha: "b".repeat(40),
                start_sha: "a".repeat(40),
              },
              web_url: "https://gitlab.com/group/project/-/merge_requests/42",
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        if (endpoint === "projects/group%2Fproject") {
          return {
            stdout: JSON.stringify({ default_branch: "main" }),
            stderr: "",
            exitCode: 0,
          };
        }
        return { stdout: "", stderr: `unexpected endpoint: ${endpoint}`, exitCode: 1 };
      },
    };

    const result = await fetchGlMR(runtime, {
      platform: "gitlab",
      host: "gitlab.com",
      projectPath: "group/project",
      iid: 42,
    });

    expect(result.metadata).toMatchObject({
      platform: "gitlab",
      projectPath: "group/project",
      iid: 42,
      baseBranch: "main",
      headBranch: "feature/app",
    });
    expect(result.rawPatch).toBe(rawPatch);
    expect(result.rawPatch).toContain("diff --git a/package-lock.json b/package-lock.json");
    expect(result.rawPatch).toContain("Binary files /dev/null and b/tests/snap.png differ");
    expect(calls).toContain("glab api projects/group%2Fproject/merge_requests/42/raw_diffs");
    expect(calls.some((call) => call.includes("/diffs?per_page=100"))).toBe(false);
  });
});

// --- raw_diffs → JSON /diffs fallback (older self-hosted GitLab + oversized MRs) ---

const REF = { platform: "gitlab" as const, host: "gitlab.com", projectPath: "g/p", iid: 1 };

const DIFF_ENTRIES_JSON = JSON.stringify([
  {
    old_path: "src/a.ts",
    new_path: "src/a.ts",
    new_file: false,
    deleted_file: false,
    renamed_file: false,
    diff: "@@ -1 +1 @@\n-old\n+new\n",
  },
]);

interface GitlabRuntimeResult {
  readonly runtime: PRRuntime;
  readonly calls: string[];
}

function gitlabRuntime(opts: {
  rawDiffs: { stdout?: string; stderr?: string; exitCode: number };
  diffs?: { stdout?: string; stderr?: string; exitCode: number };
}): GitlabRuntimeResult {
  const calls: string[] = [];
  const metadata = JSON.stringify({
    title: "T",
    author: { username: "u" },
    source_branch: "feature",
    target_branch: "main",
    diff_refs: { base_sha: "a".repeat(40), head_sha: "b".repeat(40), start_sha: "a".repeat(40) },
    web_url: "https://gitlab.com/g/p/-/merge_requests/1",
  });
  const runtime: PRRuntime = {
    async runCommand(command, args) {
      calls.push([command, ...args].join(" "));
      const endpoint = args[1] ?? "";
      if (endpoint.endsWith("/raw_diffs")) {
        return { stdout: opts.rawDiffs.stdout ?? "", stderr: opts.rawDiffs.stderr ?? "", exitCode: opts.rawDiffs.exitCode };
      }
      if (endpoint.includes("/diffs?per_page=100")) {
        return { stdout: opts.diffs?.stdout ?? "", stderr: opts.diffs?.stderr ?? "", exitCode: opts.diffs?.exitCode ?? 1 };
      }
      if (/merge_requests\/\d+$/.test(endpoint)) {
        return { stdout: metadata, stderr: "", exitCode: 0 };
      }
      if (/^projects\/[^/]+$/.test(endpoint)) {
        return { stdout: JSON.stringify({ default_branch: "main" }), stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: `unexpected endpoint: ${endpoint}`, exitCode: 1 };
    },
  };
  return { runtime, calls };
}

function gitlabMetadataRuntime(
  metadataJson: string,
  projectResponse: { stdout: string; exitCode: number } = {
    stdout: JSON.stringify({ default_branch: "main" }),
    exitCode: 0,
  },
): GitlabRuntimeResult {
  const calls: string[] = [];
  const runtime: PRRuntime = {
    async runCommand(command, args) {
      calls.push([command, ...args].join(" "));
      const endpoint = args[1] ?? "";
      if (endpoint.endsWith("/raw_diffs")) {
        return { stdout: "diff --git a/a.ts b/a.ts\n", stderr: "", exitCode: 0 };
      }
      if (/merge_requests\/\d+$/.test(endpoint)) {
        return { stdout: metadataJson, stderr: "", exitCode: 0 };
      }
      if (endpoint.startsWith("projects/")) {
        return { stdout: projectResponse.stdout, stderr: "", exitCode: projectResponse.exitCode };
      }
      return { stdout: "", stderr: `unexpected endpoint: ${endpoint}`, exitCode: 1 };
    },
  };
  return { runtime, calls };
}

describe("fetchGlMR metadata boundary", () => {
  const validMetadata = {
    title: "",
    author: { username: "u" },
    source_branch: "feature",
    target_branch: "main",
    diff_refs: { base_sha: "a", head_sha: "b" },
    web_url: "",
    unknown: { preserved: true },
  };

  test("rejects invalid JSON and malformed required fields", async () => {
    const invalidJson = gitlabMetadataRuntime("not json");
    await expect(fetchGlMR(invalidJson.runtime, REF)).rejects.toThrow(
      /Failed to fetch MR metadata: Invalid response/,
    );
    expect(invalidJson.calls.some((call) => call === "glab api projects/g%2Fp")).toBe(false);

    const malformed = gitlabMetadataRuntime(
      JSON.stringify({ ...validMetadata, author: { username: 42 } }),
    );
    await expect(fetchGlMR(malformed.runtime, REF)).rejects.toThrow(
      /Failed to fetch MR metadata: Invalid response/,
    );
  });

  test("preserves the explicit missing diff refs error", async () => {
    for (const diff_refs of [null, undefined]) {
      const metadata = { ...validMetadata, diff_refs };
      await expect(fetchGlMR(gitlabMetadataRuntime(JSON.stringify(metadata)).runtime, REF)).rejects.toThrow(
        /MR has no diff refs/,
      );
    }
  });

  test("routes a valid target project id and preserves compatible metadata", async () => {
    const { runtime, calls } = gitlabMetadataRuntime(
      JSON.stringify({ ...validMetadata, target_project_id: 123 }),
    );
    const result = await fetchGlMR(runtime, REF);

    expect(calls).toContain("glab api projects/123");
    expect(result.metadata).toMatchObject({ title: "", author: "u", url: "", defaultBranch: "main" });
  });

  test("falls back to the encoded project path for malformed target ids and project metadata", async () => {
    const { runtime, calls } = gitlabMetadataRuntime(
      JSON.stringify({ ...validMetadata, target_project_id: "123" }),
      { stdout: "not json", exitCode: 0 },
    );
    const result = await fetchGlMR(runtime, REF);

    expect(calls).toContain("glab api projects/g%2Fp");
    expect(result.metadata.defaultBranch).toBeUndefined();
  });
});

describe("getGlUser", () => {
  test("decodes optional usernames and preserves null fallbacks", async () => {
    const responses = [
      { stdout: JSON.stringify({ username: "dev", unknown: true }), exitCode: 0, expected: "dev" },
      { stdout: JSON.stringify({ username: "" }), exitCode: 0, expected: "" },
      { stdout: JSON.stringify({ username: 42 }), exitCode: 0, expected: null },
      { stdout: JSON.stringify({}), exitCode: 0, expected: null },
      { stdout: "null", exitCode: 0, expected: null },
      { stdout: "not json", exitCode: 0, expected: null },
      { stdout: "", exitCode: 0, expected: null },
      { stdout: "ignored", exitCode: 1, expected: null },
    ];

    for (const response of responses) {
      const runtime: PRRuntime = { async runCommand() { return { stdout: response.stdout, stderr: "", exitCode: response.exitCode }; } };
      await expect(getGlUser(runtime, "gitlab.com")).resolves.toBe(response.expected);
    }
  });

  test("routes self-hosted requests with a hostname", async () => {
    let args: string[] = [];
    const runtime: PRRuntime = {
      async runCommand(command, commandArgs) {
        args = commandArgs;
        return { stdout: JSON.stringify({ username: "dev" }), stderr: "", exitCode: 0 };
      },
    };

    await expect(getGlUser(runtime, "gitlab.example.com")).resolves.toBe("dev");
    expect(args).toContain("--hostname");
    expect(args).toContain("gitlab.example.com");
  });
});

describe("submitGlMRReview diff refs", () => {
  const reviewRef = { platform: "gitlab" as const, host: "gitlab.com", projectPath: "g/p", iid: 1 };
  const fileComments = [{ path: "src/a.ts", line: 3, side: "RIGHT" as const, body: "Review" }];

  async function submitAndReadPosition(
    metadataResponse: { stdout: string; exitCode: number },
  ): Promise<{ base_sha: string; start_sha: string }> {
    let position = { base_sha: "", start_sha: "" };
    const runtime: PRRuntime = {
      async runCommand() {
        return { stdout: metadataResponse.stdout, stderr: "", exitCode: metadataResponse.exitCode };
      },
      async runCommandWithInput(command, args, input) {
        const payload = Schema.decodeUnknownSync(
          Schema.fromJsonString(Schema.Struct({
            position: Schema.Struct({ base_sha: Schema.String, start_sha: Schema.String }),
          })),
        )(input);
        position = payload.position;
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    };
    await submitGlMRReview(runtime, reviewRef, "head-fallback", "comment", "", fileComments);
    return position;
  }

  test("uses valid diff refs and independent fallbacks for malformed siblings", async () => {
    const cases = [
      {
        response: JSON.stringify({ diff_refs: { base_sha: "base", start_sha: "start", head_sha: "ignored" } }),
        expected: { base_sha: "base", start_sha: "start" },
      },
      {
        response: JSON.stringify({ diff_refs: { base_sha: 42, start_sha: "start" } }),
        expected: { base_sha: "head-fallback", start_sha: "start" },
      },
      {
        response: JSON.stringify({ diff_refs: { base_sha: "base", start_sha: 42 } }),
        expected: { base_sha: "base", start_sha: "head-fallback" },
      },
      { response: JSON.stringify({ diff_refs: null }), expected: { base_sha: "head-fallback", start_sha: "head-fallback" } },
      { response: "not json", expected: { base_sha: "head-fallback", start_sha: "head-fallback" } },
      { response: "", expected: { base_sha: "head-fallback", start_sha: "head-fallback" } },
    ];

    for (const { response, expected } of cases) {
      await expect(submitAndReadPosition({ stdout: response, exitCode: 0 })).resolves.toMatchObject(expected);
    }
    await expect(submitAndReadPosition({ stdout: "ignored", exitCode: 1 })).resolves.toMatchObject({
      base_sha: "head-fallback",
      start_sha: "head-fallback",
    });
  });

  test("does not fetch diff refs when there are no inline comments", async () => {
    let metadataCalls = 0;
    const runtime: PRRuntime = {
      async runCommand() {
        metadataCalls++;
        return { stdout: "not json", stderr: "", exitCode: 0 };
      },
      async runCommandWithInput() {
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    };

    await submitGlMRReview(runtime, reviewRef, "head", "comment", "Body only", []);
    expect(metadataCalls).toBe(0);
  });
});

describe("fetchGlMRContext labels and notes", () => {
  test("normalizes malformed MR roots without losing valid sibling endpoint data", async () => {
    for (const mrRoot of ["not json", "null", "[]", "42"]) {
      const runtime: PRRuntime = {
        async runCommand(command, args) {
          const endpoint = args[1] ?? "";
          if (endpoint.endsWith("/merge_requests/1")) return { stdout: mrRoot, stderr: "", exitCode: 0 };
          if (endpoint.endsWith("/notes?sort=asc&per_page=100")) {
            return {
              stdout: JSON.stringify([{ id: 1, body: "note", author: { username: "dev" } }]),
              stderr: "",
              exitCode: 0,
            };
          }
          return { stdout: "[]", stderr: "", exitCode: 0 };
        },
      };

      await expect(fetchGlMRContext(runtime, REF)).resolves.toMatchObject({
        state: "",
        labels: [],
        comments: [{ id: "1", body: "note", author: "dev" }],
      });
    }
  });

  test("retains valid siblings while filtering malformed labels and notes", async () => {
    const calls: string[] = [];
    const runtime: PRRuntime = {
      async runCommand(command, args) {
        calls.push([command, ...args].join(" "));
        const endpoint = args[1] ?? "";
        if (endpoint.endsWith("/merge_requests/1")) {
          return {
            stdout: JSON.stringify({
              labels: ["bug", { name: "team", color: "#123456" }, { name: 42 }],
              state: "opened",
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        if (endpoint.endsWith("/notes?sort=asc&per_page=100")) {
          return {
            stdout: JSON.stringify([
              {
                id: 1,
                author: { username: "first" },
                body: "First note",
                created_at: "2024-01-01T00:00:00Z",
                web_url: "https://gitlab.com/notes/1",
              },
              { id: 2, body: 42 },
              {
                system: true,
                id: 3,
                author: { username: "system" },
                body: "System note",
              },
              {
                id: 4,
                author: { username: "second" },
                body: "Second note",
                created_at: "2024-01-02T00:00:00Z",
                web_url: "https://gitlab.com/notes/4",
              },
            ]),
            stderr: "",
            exitCode: 0,
          };
        }
        if (endpoint.endsWith("/approvals")) return { stdout: "{}", stderr: "", exitCode: 0 };
        if (endpoint.endsWith("/pipelines?per_page=5")) return { stdout: "[]", stderr: "", exitCode: 0 };
        if (endpoint.endsWith("/closes_issues")) return { stdout: "[]", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "unexpected", exitCode: 1 };
      },
    };

    const context = await fetchGlMRContext(runtime, REF);

    expect(context.labels).toEqual([
      { name: "bug", color: "" },
      { name: "team", color: "#123456" },
    ]);
    expect(context.comments).toEqual([
      {
        id: "1",
        author: "first",
        body: "First note",
        createdAt: "2024-01-01T00:00:00Z",
        url: "https://gitlab.com/notes/1",
      },
      {
        id: "4",
        author: "second",
        body: "Second note",
        createdAt: "2024-01-02T00:00:00Z",
        url: "https://gitlab.com/notes/4",
      },
    ]);
    expect(calls.some((call) => call.includes("/notes?sort=asc&per_page=100"))).toBe(true);
  });
});

describe("fetchGlMRContext approvals, checks, and linked issues", () => {
  const contextRef = { platform: "gitlab" as const, host: "gitlab.com", projectPath: "g/p", iid: 1 };

  test("retains valid approvers, jobs, and linked issues around malformed siblings", async () => {
    const calls: string[] = [];
    const runtime: PRRuntime = {
      async runCommand(command, args) {
        calls.push([command, ...args].join(" "));
        const endpoint = args[1] ?? "";
        if (endpoint.endsWith("/merge_requests/1")) return { stdout: JSON.stringify({ state: "opened" }), stderr: "", exitCode: 0 };
        if (endpoint.endsWith("/approvals")) {
          return {
            stdout: JSON.stringify({
              approved: false,
              approved_by: [
                { user: { id: 1, username: "first" } },
                { user: 42 },
                { user: { id: "2", username: "second" } },
              ],
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        if (endpoint.endsWith("/pipelines?per_page=5")) {
          return { stdout: JSON.stringify([{ id: 7, ref: "main" }]), stderr: "", exitCode: 0 };
        }
        if (endpoint.endsWith("/pipelines/7/jobs?per_page=100")) {
          return {
            stdout: JSON.stringify([
              { name: "build", status: "success", web_url: "https://jobs/1" },
              { name: "bad", status: 42 },
              { name: "test", status: "running", web_url: "https://jobs/2" },
            ]),
            stderr: "",
            exitCode: 0,
          };
        }
        if (endpoint.endsWith("/closes_issues")) {
          return {
            stdout: JSON.stringify([
              { iid: 10, web_url: "https://issues/10" },
              { iid: "bad", web_url: "https://issues/bad" },
              { iid: 11, web_url: "https://issues/11" },
            ]),
            stderr: "",
            exitCode: 0,
          };
        }
        if (endpoint.endsWith("/notes?sort=asc&per_page=100")) return { stdout: "[]", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "unexpected", exitCode: 1 };
      },
    };

    const context = await fetchGlMRContext(runtime, contextRef);

    expect(context.reviewDecision).toBe("APPROVED");
    expect(context.reviews).toEqual([
      { id: "1", author: "first", state: "APPROVED", body: "", submittedAt: "" },
      { id: "2", author: "second", state: "APPROVED", body: "", submittedAt: "" },
    ]);
    expect(context.checks).toEqual([
      {
        name: "build",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        workflowName: "main",
        detailsUrl: "https://jobs/1",
      },
      {
        name: "test",
        status: "IN_PROGRESS",
        conclusion: null,
        workflowName: "main",
        detailsUrl: "https://jobs/2",
      },
    ]);
    expect(context.linkedIssues).toEqual([
      { number: 10, url: "https://issues/10", repo: "g/p" },
      { number: 11, url: "https://issues/11", repo: "g/p" },
    ]);
  });

  test("does not fetch jobs when the first pipeline is malformed", async () => {
    const calls: string[] = [];
    const runtime: PRRuntime = {
      async runCommand(command, args) {
        calls.push([command, ...args].join(" "));
        const endpoint = args[1] ?? "";
        if (endpoint.endsWith("/merge_requests/1")) return { stdout: "{}", stderr: "", exitCode: 0 };
        if (endpoint.endsWith("/pipelines?per_page=5")) return { stdout: JSON.stringify([{ id: {} }, { id: 9 }]), stderr: "", exitCode: 0 };
        return { stdout: "[]", stderr: "", exitCode: 0 };
      },
    };

    const context = await fetchGlMRContext(runtime, contextRef);
    expect(context.checks).toEqual([]);
    expect(calls.some((call) => call.includes("/jobs?per_page=100"))).toBe(false);
  });

  test("keeps endpoint fallback defaults when response JSON is invalid", async () => {
    const runtime: PRRuntime = {
      async runCommand(command, args) {
        const endpoint = args[1] ?? "";
        if (endpoint.endsWith("/merge_requests/1")) return { stdout: JSON.stringify({ state: "opened" }), stderr: "", exitCode: 0 };
        if (endpoint.endsWith("/approvals") || endpoint.endsWith("/pipelines?per_page=5") || endpoint.endsWith("/closes_issues")) {
          return { stdout: "not json", stderr: "", exitCode: 0 };
        }
        if (endpoint.endsWith("/notes?sort=asc&per_page=100")) return { stdout: "[]", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "unexpected", exitCode: 1 };
      },
    };

    const context = await fetchGlMRContext(runtime, contextRef);
    expect(context.reviewDecision).toBe("");
    expect(context.reviews).toEqual([]);
    expect(context.checks).toEqual([]);
    expect(context.linkedIssues).toEqual([]);
  });
});

describe("fetchGlMR raw_diffs fallback", () => {
  test("falls back to the JSON diffs API when raw_diffs is unavailable (older GitLab)", async () => {
    const { runtime, calls } = gitlabRuntime({
      rawDiffs: { exitCode: 1, stderr: "404 Not Found" },
      diffs: { exitCode: 0, stdout: DIFF_ENTRIES_JSON },
    });
    const result = await fetchGlMR(runtime, REF);
    expect(result.rawPatch).toContain("diff --git a/src/a.ts b/src/a.ts");
    expect(result.rawPatch).toContain("+new");
    expect(calls.some((c) => c.includes("/diffs?per_page=100"))).toBe(true);
  });

  test("reconstructed renames carry a similarity line so parsers classify them as renames", async () => {
    const entries = JSON.stringify([
      {
        old_path: "src/old.ts",
        new_path: "src/new.ts",
        new_file: false,
        deleted_file: false,
        renamed_file: true,
        diff: "", // pure rename — GitLab sends an empty diff
      },
      {
        old_path: "src/before.ts",
        new_path: "src/after.ts",
        new_file: false,
        deleted_file: false,
        renamed_file: true,
        diff: "@@ -1 +1 @@\n-a\n+b\n",
      },
    ]);
    const { runtime } = gitlabRuntime({
      rawDiffs: { exitCode: 1, stderr: "404 Not Found" },
      diffs: { exitCode: 0, stdout: entries },
    });
    const result = await fetchGlMR(runtime, REF);
    expect(result.rawPatch).toContain(
      "diff --git a/src/old.ts b/src/new.ts\nsimilarity index 100%\nrename from src/old.ts\nrename to src/new.ts",
    );
    expect(result.rawPatch).toContain(
      "diff --git a/src/before.ts b/src/after.ts\nsimilarity index 99%\nrename from src/before.ts\nrename to src/after.ts",
    );
  });

  test("falls back when raw_diffs returns empty (oversized MR)", async () => {
    const { runtime, calls } = gitlabRuntime({
      rawDiffs: { exitCode: 0, stdout: "" },
      diffs: { exitCode: 0, stdout: DIFF_ENTRIES_JSON },
    });
    const result = await fetchGlMR(runtime, REF);
    expect(result.rawPatch).toContain("diff --git a/src/a.ts b/src/a.ts");
    expect(calls.some((c) => c.includes("/diffs?per_page=100"))).toBe(true);
  });

  test("flags the patch incomplete when GitLab withholds content for a modified file", async () => {
    const entries = JSON.stringify([
      {
        old_path: "src/big.ts",
        new_path: "src/big.ts",
        new_file: false,
        deleted_file: false,
        renamed_file: false,
        diff: "", // modified file with no content = withheld
      },
      {
        old_path: "src/old.ts",
        new_path: "src/new.ts",
        new_file: false,
        deleted_file: false,
        renamed_file: true,
        diff: "", // pure rename — complete information, must not flag
      },
    ]);
    const { runtime } = gitlabRuntime({
      rawDiffs: { exitCode: 1, stderr: "404 Not Found" },
      diffs: { exitCode: 0, stdout: entries },
    });

    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await fetchGlMR(runtime, REF);
      expect(result.patchIncomplete).toBe(true);
    } finally {
      errSpy.mockRestore();
    }
  });

  test("too_large/collapsed flags catch withheld ADDED files (modern GitLab)", async () => {
    // A too-large added file has new_file:true and an empty diff — without
    // the explicit flag it would be indistinguishable from a legitimately
    // empty new file and the upgrade would never be offered.
    const entries = JSON.stringify([
      {
        old_path: "src/huge.ts",
        new_path: "src/huge.ts",
        new_file: true,
        deleted_file: false,
        renamed_file: false,
        too_large: true,
        collapsed: false,
        diff: "",
      },
    ]);
    const { runtime } = gitlabRuntime({
      rawDiffs: { exitCode: 1, stderr: "404 Not Found" },
      diffs: { exitCode: 0, stdout: entries },
    });

    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await fetchGlMR(runtime, REF);
      expect(result.patchIncomplete).toBe(true);
    } finally {
      errSpy.mockRestore();
    }
  });

  test("null too_large/collapsed are inconclusive — the legacy heuristic still decides", async () => {
    const entries = JSON.stringify([
      {
        old_path: "src/big.ts",
        new_path: "src/big.ts",
        new_file: false,
        deleted_file: false,
        renamed_file: false,
        too_large: null,
        collapsed: null,
        diff: "", // modified file, no content, flags unknown → withheld
      },
    ]);
    const { runtime } = gitlabRuntime({
      rawDiffs: { exitCode: 1, stderr: "404 Not Found" },
      diffs: { exitCode: 0, stdout: entries },
    });

    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await fetchGlMR(runtime, REF);
      expect(result.patchIncomplete).toBe(true);
    } finally {
      errSpy.mockRestore();
    }
  });

  test("explicit too_large:false exonerates empty-diff entries (binary/empty files, modern GitLab)", async () => {
    const entries = JSON.stringify([
      {
        old_path: "logo.png",
        new_path: "logo.png",
        new_file: false,
        deleted_file: false,
        renamed_file: false,
        too_large: false,
        collapsed: false,
        diff: "", // binary — complete information, must not flag
      },
      {
        old_path: "src/ok.ts",
        new_path: "src/ok.ts",
        new_file: false,
        deleted_file: false,
        renamed_file: false,
        too_large: false,
        collapsed: false,
        diff: "@@ -1 +1 @@\n-a\n+b\n",
      },
    ]);
    const { runtime } = gitlabRuntime({
      rawDiffs: { exitCode: 1, stderr: "404 Not Found" },
      diffs: { exitCode: 0, stdout: entries },
    });
    const result = await fetchGlMR(runtime, REF);
    expect(result.patchIncomplete).toBeFalsy();
  });

  test("does not flag a fallback where every entry carries content", async () => {
    const { runtime } = gitlabRuntime({
      rawDiffs: { exitCode: 1, stderr: "404 Not Found" },
      diffs: { exitCode: 0, stdout: DIFF_ENTRIES_JSON },
    });
    const result = await fetchGlMR(runtime, REF);
    expect(result.patchIncomplete).toBeFalsy();
  });

  test("throws a clear empty-diff error when both raw_diffs and diffs are empty", async () => {
    const { runtime } = gitlabRuntime({
      rawDiffs: { exitCode: 0, stdout: "" },
      diffs: { exitCode: 0, stdout: "[]" },
    });
    await expect(fetchGlMR(runtime, REF)).rejects.toThrow(/MR diff is empty/);
  });

  test("throws a combined error when both raw_diffs and diffs fail", async () => {
    const { runtime } = gitlabRuntime({
      rawDiffs: { exitCode: 1, stderr: "raw boom" },
      diffs: { exitCode: 1, stderr: "diffs boom" },
    });
    await expect(fetchGlMR(runtime, REF)).rejects.toThrow(/Failed to fetch MR diff/);
  });
});
