import { describe, expect, test, spyOn } from "bun:test";
import {
  fetchGhPR,
  fetchGhPRContext,
  fetchGhPRList,
  fetchGhPRStack,
  fetchGhPRViewedFiles,
  reconstructGhPatch,
} from "./pr-github";
import {
  parseDiffGitHeader,
  parseDiffFilePathLines,
  parseDiffMetadataPathLines,
} from "./diff-paths";
import type { PRMetadata, PRRuntime } from "./pr-types";

const REF = { host: "github.com", owner: "o", repo: "r", number: 123 };

const VIEW_JSON = JSON.stringify({
  id: "PR_node123",
  title: "Big change",
  author: { login: "dev" },
  baseRefName: "main",
  headRefName: "feature",
  baseRefOid: "a".repeat(40),
  headRefOid: "b".repeat(40),
  url: "https://github.com/o/r/pull/123",
});

/**
 * Mock gh runtime. Routes by subcommand; records every invocation so tests can
 * assert on exactly which commands ran (and which didn't).
 */
interface GithubRuntimeResult {
  readonly runtime: PRRuntime;
  readonly calls: string[];
}

interface GithubRuntimeOptions {
  readonly prDiff: { stdout?: string; stderr?: string; exitCode: number };
  readonly files?: { stdout?: string; stderr?: string; exitCode: number };
  readonly view?: { stdout?: string; stderr?: string; exitCode: number };
}

function githubPullRequestCommandResult(args: string[], opts: GithubRuntimeOptions) {
  if (args[0] === "pr" && args[1] === "diff") {
    return {
      stdout: opts.prDiff.stdout ?? "",
      stderr: opts.prDiff.stderr ?? "",
      exitCode: opts.prDiff.exitCode,
    };
  }
  if (args[0] === "pr" && args[1] === "view") {
    return {
      stdout: opts.view?.stdout ?? VIEW_JSON,
      stderr: opts.view?.stderr ?? "",
      exitCode: opts.view?.exitCode ?? 0,
    };
  }
  return null;
}

function githubApiCommandResult(args: string[], opts: GithubRuntimeOptions) {
  if (args[0] !== "api") return null;
  if (args[1]?.includes("/compare/")) {
    return { stdout: `${"c".repeat(40)}\n`, stderr: "", exitCode: 0 };
  }
  if (args[1]?.includes("/pulls/123/files")) {
    return {
      stdout: opts.files?.stdout ?? "",
      stderr: opts.files?.stderr ?? "",
      exitCode: opts.files?.exitCode ?? 1,
    };
  }
  return null;
}

function githubRuntimeCommandResult(args: string[], opts: GithubRuntimeOptions) {
  const prResult = githubPullRequestCommandResult(args, opts);
  if (prResult) return prResult;
  if (args[0] === "repo" && args[1] === "view") {
    return { stdout: "main\n", stderr: "", exitCode: 0 };
  }
  const apiResult = githubApiCommandResult(args, opts);
  if (apiResult) return apiResult;
  return { stdout: "", stderr: `unexpected command: ${args.join(" ")}`, exitCode: 1 };
}

function githubRuntime(opts: GithubRuntimeOptions): GithubRuntimeResult {
  const calls: string[] = [];
  const runtime: PRRuntime = {
    async runCommand(command, args) {
      calls.push([command, ...args].join(" "));
      return githubRuntimeCommandResult(args, opts);
    },
  };
  return { runtime, calls };
}

describe("fetchGhPR", () => {
  test("uses gh pr diff verbatim when it succeeds and never touches the files API", async () => {
    const patch = "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n";
    const { runtime, calls } = githubRuntime({ prDiff: { exitCode: 0, stdout: patch } });

    const result = await fetchGhPR(runtime, REF);

    expect(result.rawPatch).toBe(patch);
    expect(result.metadata).toMatchObject({
      number: 123,
      baseBranch: "main",
      headBranch: "feature",
      mergeBaseSha: "c".repeat(40),
    });
    expect(calls.some((c) => c.includes("/pulls/123/files"))).toBe(false);
  });

  test("falls back to the paginated files API when gh pr diff fails (oversized PR)", async () => {
    // Two concatenated pages — the actual shape `gh api --paginate` emits.
    const page1 = JSON.stringify([
      { filename: "src/a.ts", status: "modified", patch: "@@ -1 +1 @@\n-old\n+new" },
    ]);
    const page2 = JSON.stringify([
      { filename: "src/b.ts", status: "added", patch: "@@ -0,0 +1 @@\n+hello" },
    ]);
    const { runtime, calls } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "diff exceeded the maximum number of lines (20000)" },
      files: { exitCode: 0, stdout: page1 + page2 },
    });

    const result = await fetchGhPR(runtime, REF);

    expect(calls).toContain("gh api repos/o/r/pulls/123/files?per_page=100 --paginate");
    expect(result.rawPatch).toContain("diff --git a/src/a.ts b/src/a.ts");
    expect(result.rawPatch).toContain("+new");
    expect(result.rawPatch).toContain("diff --git a/src/b.ts b/src/b.ts");
    expect(result.rawPatch).toContain("new file mode 100644");
    // Every entry carried a patch — nothing is missing, no upgrade needed.
    expect(result.patchIncomplete).toBeFalsy();
    // Metadata path is unaffected by the fallback.
    expect(result.metadata).toMatchObject({ number: 123, mergeBaseSha: "c".repeat(40) });
  });

  test("flags the patch incomplete when GitHub omits content for non-rename entries", async () => {
    // The real shape from oversized PRs: status added/modified with zeroed
    // counts and no patch field at all.
    const entries = JSON.stringify([
      { filename: "src/big.rs", status: "added" },
      { filename: "src/also.zig", status: "modified" },
      { filename: "src/ok.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
    ]);
    const { runtime } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "406" },
      files: { exitCode: 0, stdout: entries },
    });

    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await fetchGhPR(runtime, REF);
      expect(result.patchIncomplete).toBe(true);
      const warned = errSpy.mock.calls.some((args) =>
        String(args[0]).includes("omitted diff content for 2 file(s)"),
      );
      expect(warned).toBe(true);
    } finally {
      errSpy.mockRestore();
    }
  });

  test("pure renames without patches are complete information — not flagged", async () => {
    const entries = JSON.stringify([
      { filename: "src/new.ts", previous_filename: "src/old.ts", status: "renamed" },
      { filename: "src/ok.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
    ]);
    const { runtime } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "406" },
      files: { exitCode: 0, stdout: entries },
    });

    const result = await fetchGhPR(runtime, REF);
    expect(result.patchIncomplete).toBeFalsy();
  });

  test("never flags the verbatim gh pr diff path as incomplete", async () => {
    const patch = "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n";
    const { runtime } = githubRuntime({ prDiff: { exitCode: 0, stdout: patch } });

    const result = await fetchGhPR(runtime, REF);
    expect(result.patchIncomplete).toBeFalsy();
  });

  test("passes --hostname to the files API on GitHub Enterprise", async () => {
    const { runtime, calls } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "406" },
      files: {
        exitCode: 0,
        stdout: JSON.stringify([
          { filename: "a.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
        ]),
      },
    });

    await fetchGhPR(runtime, { ...REF, host: "ghe.corp.com" });

    const filesCall = calls.find((c) => c.includes("/pulls/123/files"));
    expect(filesCall).toContain("--hostname ghe.corp.com");
  });

  test("surfaces both errors when gh pr diff and the files API both fail", async () => {
    const { runtime } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "diff too large" },
      files: { exitCode: 1, stderr: "files boom" },
    });

    await expect(fetchGhPR(runtime, REF)).rejects.toThrow(
      /diff too large.*files boom|files boom.*diff too large/s,
    );
  });

  test("throws a clear empty-diff error when the files API returns no entries", async () => {
    const { runtime } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "406" },
      files: { exitCode: 0, stdout: "[]" },
    });

    await expect(fetchGhPR(runtime, REF)).rejects.toThrow(/PR diff is empty/);
  });

  test("warns when the files API returns fewer files than the PR reports (3000-file cap)", async () => {
    const view = JSON.parse(VIEW_JSON);
    view.changedFiles = 3500;
    const { runtime } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "406" },
      files: {
        exitCode: 0,
        stdout: JSON.stringify([
          { filename: "a.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
        ]),
      },
      view: { exitCode: 0, stdout: JSON.stringify(view) },
    });

    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await fetchGhPR(runtime, REF);
      expect(result.rawPatch).toContain("diff --git a/a.ts b/a.ts"); // partial diff still served
      expect(result.patchIncomplete).toBe(true); // 3000-file cap → upgrade offered
      const warned = errSpy.mock.calls.some((args) =>
        String(args[0]).includes("3500 changed files"),
      );
      expect(warned).toBe(true);
    } finally {
      errSpy.mockRestore();
    }
  });

  test("metadata failure wins over diff failure — no fallback attempted", async () => {
    const { runtime, calls } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "406" },
      files: { exitCode: 0, stdout: "[]" },
      view: { exitCode: 1, stderr: "no such PR" },
    });

    await expect(fetchGhPR(runtime, REF)).rejects.toThrow(/Failed to fetch PR metadata/);
    expect(calls.some((c) => c.includes("/pulls/123/files"))).toBe(false);
  });

  test("rejects invalid metadata JSON before fallback or compare requests", async () => {
    const { runtime, calls } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "406" },
      files: { exitCode: 0, stdout: "[]" },
      view: { exitCode: 0, stdout: "not json" },
    });

    await expect(fetchGhPR(runtime, REF)).rejects.toThrow(
      /Failed to fetch PR metadata: Invalid response/,
    );
    expect(calls.some((c) => c.includes("/pulls/123/files"))).toBe(false);
    expect(calls.some((c) => c.includes("/compare/"))).toBe(false);
  });

  test("rejects malformed required metadata fields", async () => {
    const view = JSON.parse(VIEW_JSON);
    view.author.login = 42;
    const { runtime, calls } = githubRuntime({
      prDiff: { exitCode: 0, stdout: "diff --git a/a.ts b/a.ts\n" },
      view: { exitCode: 0, stdout: JSON.stringify(view) },
    });

    await expect(fetchGhPR(runtime, REF)).rejects.toThrow(
      /Failed to fetch PR metadata: Invalid response/,
    );
    expect(calls.some((c) => c.includes("/compare/"))).toBe(false);
  });

  test("ignores a malformed optional changedFiles count", async () => {
    const view = JSON.parse(VIEW_JSON);
    view.changedFiles = "many";
    const { runtime } = githubRuntime({
      prDiff: { exitCode: 1, stderr: "406" },
      files: {
        exitCode: 0,
        stdout: JSON.stringify([
          { filename: "a.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
        ]),
      },
      view: { exitCode: 0, stdout: JSON.stringify(view) },
    });

    const result = await fetchGhPR(runtime, REF);
    expect(result.patchIncomplete).toBeFalsy();
  });
});

describe("fetchGhPRList", () => {
  const listRef = {
    host: "github.com",
    owner: "o",
    repo: "r",
    number: 123,
  };

  test("decodes valid entries and filters malformed siblings", async () => {
    const runtime: PRRuntime = {
      async runCommand() {
        return {
          stdout: JSON.stringify([
            {
              number: 1,
              title: "",
              author: { login: "" },
              url: "",
              baseRefName: "",
              state: "OPEN",
            },
            {
              number: 1,
              title: "Duplicate",
              author: { login: "dev" },
              url: "url",
              baseRefName: "main",
              state: "MERGED",
            },
            {
              number: 2,
              title: "Closed",
              author: { login: "dev" },
              url: "url-2",
              baseRefName: "main",
              state: "CLOSED",
            },
            {
              number: 3,
              title: "Bad author",
              author: { login: 42 },
              url: "url-3",
              baseRefName: "main",
              state: "OPEN",
            },
            {
              number: 4,
              title: "Bad state",
              author: { login: "dev" },
              url: "url-4",
              baseRefName: "main",
              state: "UNKNOWN",
            },
          ]),
          stderr: "",
          exitCode: 0,
        };
      },
    };

    await expect(fetchGhPRList(runtime, listRef)).resolves.toEqual([
      { id: "1", number: 1, title: "", author: "", url: "", baseBranch: "", state: "open" },
      {
        id: "1",
        number: 1,
        title: "Duplicate",
        author: "dev",
        url: "url",
        baseBranch: "main",
        state: "merged",
      },
      {
        id: "2",
        number: 2,
        title: "Closed",
        author: "dev",
        url: "url-2",
        baseBranch: "main",
        state: "closed",
      },
    ]);
  });

  test("preserves empty output, exit fallback, and root parse failures", async () => {
    const outputs = [
      { stdout: "[]", exitCode: 0 },
      { stdout: "", exitCode: 1 },
    ];
    for (const output of outputs) {
      const runtime: PRRuntime = {
        async runCommand() {
          return { ...output, stderr: "failed" };
        },
      };
      await expect(fetchGhPRList(runtime, listRef)).resolves.toEqual([]);
    }

    const invalidJson: PRRuntime = {
      async runCommand() {
        return { stdout: "not json", stderr: "", exitCode: 0 };
      },
    };
    await expect(fetchGhPRList(invalidJson, listRef)).rejects.toThrow();

    const nonArray: PRRuntime = {
      async runCommand() {
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    };
    await expect(fetchGhPRList(nonArray, listRef)).rejects.toThrow();
  });
});

describe("fetchGhPRStack", () => {
  const stackRef = {
    host: "github.com",
    owner: "o",
    repo: "r",
    number: 3,
  };
  const metadata: PRMetadata = {
    host: "github.com",
    owner: "o",
    repo: "r",
    number: 3,
    title: "Current",
    author: "dev",
    baseBranch: "base",
    headBranch: "feature",
    defaultBranch: "main",
    baseSha: "base-sha",
    headSha: "head-sha",
    url: "https://prs/3",
  };

  test("builds ordered stack nodes from valid GraphQL siblings", async () => {
    const runtime: PRRuntime = {
      async runCommand(command, args) {
        const query = args.find((arg) => arg.includes("RefName=")) ?? "";
        if (query === "headRefName=base") {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequests: {
                    nodes: [
                      {
                        number: 1,
                        title: "Ancestor",
                        url: "https://prs/1",
                        baseRefName: "main",
                        headRefName: "base",
                        state: "MERGED",
                      },
                      { number: 99, title: 42 },
                    ],
                  },
                },
              },
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        if (query === "baseRefName=feature") {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequests: {
                    nodes: [
                      {
                        number: 4,
                        title: "Descendant",
                        url: "https://prs/4",
                        baseRefName: "feature",
                        headRefName: "leaf",
                        state: "OPEN",
                      },
                    ],
                  },
                },
              },
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        return {
          stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }),
          stderr: "",
          exitCode: 0,
        };
      },
    };

    await expect(fetchGhPRStack(runtime, stackRef, metadata)).resolves.toEqual({
      nodes: [
        { branch: "main", isCurrent: false, isDefaultBranch: true },
        {
          branch: "base",
          number: 1,
          title: "Ancestor",
          url: "https://prs/1",
          isCurrent: false,
          isDefaultBranch: false,
          state: "merged",
        },
        {
          branch: "feature",
          number: 3,
          title: "Current",
          url: "https://prs/3",
          isCurrent: true,
          isDefaultBranch: false,
        },
        {
          branch: "leaf",
          number: 4,
          title: "Descendant",
          url: "https://prs/4",
          isCurrent: false,
          isDefaultBranch: false,
          state: "open",
        },
      ],
    });
  });

  test("returns null without a default branch and preserves empty query results", async () => {
    let calls = 0;
    const runtime: PRRuntime = {
      async runCommand() {
        calls++;
        return {
          stdout: JSON.stringify({ data: { repository: { pullRequests: { nodes: [] } } } }),
          stderr: "",
          exitCode: 0,
        };
      },
    };
    const noDefault = { ...metadata, defaultBranch: undefined };
    await expect(fetchGhPRStack(runtime, stackRef, noDefault)).resolves.toBeNull();
    expect(calls).toBe(0);
  });
});

describe("fetchGhPRViewedFiles", () => {
  const viewedRef = {
    host: "github.com",
    owner: "o",
    repo: "r",
    number: 123,
  };

  test("merges paginated viewed states and filters malformed file nodes", async () => {
    let page = 0;
    const runtime: PRRuntime = {
      async runCommand() {
        page++;
        if (page === 1) {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequest: {
                    files: {
                      nodes: [
                        { path: "src/a.ts", viewerViewedState: "VIEWED" },
                        { path: "src/b.ts", viewerViewedState: "UNVIEWED" },
                        { path: 42, viewerViewedState: "VIEWED" },
                      ],
                      pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
                    },
                  },
                },
              },
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        return {
          stdout: JSON.stringify({
            data: {
              repository: {
                pullRequest: {
                  files: {
                    nodes: [{ path: "src/c.ts", viewerViewedState: "DISMISSED" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            },
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    };

    await expect(fetchGhPRViewedFiles(runtime, viewedRef)).resolves.toEqual({
      "src/a.ts": true,
      "src/b.ts": false,
      "src/c.ts": true,
    });
  });

  test("throws for CLI and GraphQL errors", async () => {
    const failedCli: PRRuntime = {
      async runCommand() {
        return { stdout: "", stderr: "boom", exitCode: 1 };
      },
    };
    await expect(fetchGhPRViewedFiles(failedCli, viewedRef)).rejects.toThrow(
      /Failed to fetch PR viewed files/,
    );

    const graphqlError: PRRuntime = {
      async runCommand() {
        return {
          stdout: JSON.stringify({ errors: [{ message: "forbidden" }] }),
          stderr: "",
          exitCode: 0,
        };
      },
    };
    await expect(fetchGhPRViewedFiles(graphqlError, viewedRef)).rejects.toThrow(
      "GraphQL error: forbidden",
    );
  });
});

describe("fetchGhPRContext envelope", () => {
  const envelopeRef = {
    host: "github.com",
    owner: "o",
    repo: "r",
    number: 123,
  };

  test("rejects invalid roots before fetching review threads", async () => {
    for (const stdout of ["not json", "null", "[]"]) {
      let graphqlCalls = 0;
      const runtime: PRRuntime = {
        async runCommand(command, args) {
          if (args[0] === "pr" && args[1] === "view") {
            return { stdout, stderr: "", exitCode: 0 };
          }
          graphqlCalls++;
          return { stdout: "{}", stderr: "", exitCode: 0 };
        },
      };

      await expect(fetchGhPRContext(runtime, envelopeRef)).rejects.toThrow(
        "Failed to fetch PR context: Invalid response",
      );
      expect(graphqlCalls).toBe(0);
    }
  });

  test("preserves field-level defaults for malformed members in a valid record", async () => {
    const runtime: PRRuntime = {
      async runCommand(command, args) {
        if (args[0] === "pr" && args[1] === "view") {
          return {
            stdout: JSON.stringify({
              body: "valid body",
              state: 42,
              labels: "not an array",
              comments: "not an array",
              reviews: [],
              statusCheckRollup: [],
              closingIssuesReferences: [],
              unknownField: { preserved: true },
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        return { stdout: JSON.stringify({ data: { repository: null } }), stderr: "", exitCode: 0 };
      },
    };

    await expect(fetchGhPRContext(runtime, envelopeRef)).resolves.toMatchObject({
      body: "valid body",
      state: "",
      labels: [],
      comments: [],
      reviews: [],
      reviewThreads: [],
    });
  });
});

describe("fetchGhPRContext review threads", () => {
  const contextRef = {
    host: "github.com",
    owner: "o",
    repo: "r",
    number: 123,
  };
  const contextBody = JSON.stringify({
    body: "Context body",
    state: "OPEN",
    isDraft: false,
    labels: [],
    comments: [],
    reviews: [],
    reviewDecision: "",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    statusCheckRollup: [],
    closingIssuesReferences: [],
  });

  test("retains valid threads and comments around malformed siblings", async () => {
    const runtime: PRRuntime = {
      async runCommand(command, args) {
        if (args[0] === "pr" && args[1] === "view") {
          return { stdout: contextBody, stderr: "", exitCode: 0 };
        }
        if (args[0] === "api" && args[1] === "graphql") {
          return {
            stdout: JSON.stringify({
              data: {
                repository: {
                  pullRequest: {
                    reviewThreads: {
                      nodes: [
                        {
                          id: "thread-1",
                          isResolved: false,
                          isOutdated: false,
                          path: "src/a.ts",
                          line: 10,
                          startLine: null,
                          diffSide: "LEFT",
                          comments: {
                            nodes: [
                              {
                                id: "comment-1",
                                body: "First",
                                author: null,
                                createdAt: "2024-01-01T00:00:00Z",
                                url: "https://comments/1",
                                diffHunk: "@@ -1 +1 @@",
                              },
                              { id: "bad", body: 42 },
                              {
                                id: "comment-2",
                                body: "Second",
                                author: { login: "reviewer" },
                                createdAt: "2024-01-02T00:00:00Z",
                                url: "https://comments/2",
                                diffHunk: null,
                              },
                            ],
                          },
                        },
                        { id: "bad-thread", isResolved: true },
                        {
                          id: "thread-2",
                          isResolved: true,
                          isOutdated: true,
                          path: "src/b.ts",
                          line: null,
                          startLine: 20,
                          diffSide: "RIGHT",
                          comments: { nodes: [] },
                        },
                      ],
                    },
                  },
                },
              },
            }),
            stderr: "",
            exitCode: 0,
          };
        }
        return { stdout: "", stderr: "unexpected", exitCode: 1 };
      },
    };

    const context = await fetchGhPRContext(runtime, contextRef);

    expect(context.body).toBe("Context body");
    expect(context.reviewThreads).toEqual([
      {
        id: "thread-1",
        isResolved: false,
        isOutdated: false,
        path: "src/a.ts",
        line: 10,
        startLine: null,
        diffSide: "LEFT",
        comments: [
          {
            id: "comment-1",
            author: "",
            body: "First",
            createdAt: "2024-01-01T00:00:00Z",
            url: "https://comments/1",
            diffHunk: "@@ -1 +1 @@",
          },
          {
            id: "comment-2",
            author: "reviewer",
            body: "Second",
            createdAt: "2024-01-02T00:00:00Z",
            url: "https://comments/2",
          },
        ],
      },
      {
        id: "thread-2",
        isResolved: true,
        isOutdated: true,
        path: "src/b.ts",
        line: null,
        startLine: 20,
        diffSide: "RIGHT",
        comments: [],
      },
    ]);
  });

  test("keeps context when GraphQL fails or has no response branch", async () => {
    for (const graphqlResult of [
      { stdout: "not json", exitCode: 0 },
      { stdout: JSON.stringify({ data: { repository: null } }), exitCode: 0 },
      { stdout: "", exitCode: 1 },
    ]) {
      const runtime: PRRuntime = {
        async runCommand(command, args) {
          if (args[0] === "pr" && args[1] === "view") {
            return { stdout: contextBody, stderr: "", exitCode: 0 };
          }
          if (args[0] === "api" && args[1] === "graphql") {
            return {
              stdout: graphqlResult.stdout,
              stderr: "graphql failed",
              exitCode: graphqlResult.exitCode,
            };
          }
          return { stdout: "", stderr: "unexpected", exitCode: 1 };
        },
      };

      const context = await fetchGhPRContext(runtime, contextRef);
      expect(context.body).toBe("Context body");
      expect(context.reviewThreads).toEqual([]);
    }
  });
});

describe("reconstructGhPatch", () => {
  test("modified file round-trips through the real diff header parsers", () => {
    const patch = reconstructGhPatch([
      {
        filename: "src/app.ts",
        status: "modified",
        patch: "@@ -1,2 +1,2 @@\n-const a = 1;\n+const a = 2;\n context",
      },
    ]);

    const lines = patch.split("\n");
    expect(lines[0]).toBe("diff --git a/src/app.ts b/src/app.ts");
    expect(parseDiffGitHeader(lines[0])).toEqual({ oldPath: "src/app.ts", newPath: "src/app.ts" });
    expect(parseDiffFilePathLines(lines)).toEqual({ oldPath: "src/app.ts", newPath: "src/app.ts" });
    expect(patch).toContain("\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,2 +1,2 @@\n");
    expect(patch.endsWith("\n")).toBe(true);
  });

  test("added file uses /dev/null for the old side and new file mode", () => {
    const patch = reconstructGhPatch([
      { filename: "new.ts", status: "added", patch: "@@ -0,0 +1 @@\n+x" },
    ]);

    expect(patch).toContain("diff --git a/new.ts b/new.ts");
    expect(patch).toContain("new file mode 100644");
    expect(patch).toContain("\n--- /dev/null\n+++ b/new.ts\n");
  });

  test("removed file uses /dev/null for the new side and deleted file mode", () => {
    const patch = reconstructGhPatch([
      { filename: "gone.ts", status: "removed", patch: "@@ -1 +0,0 @@\n-x" },
    ]);

    expect(patch).toContain("diff --git a/gone.ts b/gone.ts");
    expect(patch).toContain("deleted file mode 100644");
    expect(patch).toContain("\n--- a/gone.ts\n+++ /dev/null\n");
  });

  test("renamed file emits rename metadata that the real parser extracts", () => {
    const patch = reconstructGhPatch([
      {
        filename: "after.ts",
        previous_filename: "before.ts",
        status: "renamed",
        patch: "@@ -1 +1 @@\n-a\n+b",
      },
    ]);

    const lines = patch.split("\n");
    expect(lines[0]).toBe("diff --git a/before.ts b/after.ts");
    expect(parseDiffGitHeader(lines[0])).toEqual({ oldPath: "before.ts", newPath: "after.ts" });
    expect(parseDiffMetadataPathLines(lines)).toEqual({
      oldPath: "before.ts",
      newPath: "after.ts",
    });
    // Pierre's parser classifies renames off the similarity line — a patched
    // rename must carry a sub-100% score or it renders as a plain change.
    expect(lines[1]).toBe("similarity index 99%");
  });

  test("pure rename (no patch field) emits a header-only section", () => {
    const patch = reconstructGhPatch([
      { filename: "after.ts", previous_filename: "before.ts", status: "renamed" },
    ]);

    expect(patch).toBe(
      "diff --git a/before.ts b/after.ts\nsimilarity index 100%\nrename from before.ts\nrename to after.ts\n",
    );
  });

  test("entry without patch (binary / per-file too large) doesn't corrupt the next file's section", () => {
    const patch = reconstructGhPatch([
      { filename: "huge.json", status: "modified" },
      { filename: "small.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
    ]);

    // Every diff --git header must start at the beginning of its own line —
    // this is what the UI's file splitter (split on /^diff --git /) relies on.
    const headerLines = patch.split("\n").filter((l) => l.startsWith("diff --git "));
    expect(headerLines).toEqual([
      "diff --git a/huge.json b/huge.json",
      "diff --git a/small.ts b/small.ts",
    ]);
    expect(patch).toContain("diff --git a/huge.json b/huge.json\ndiff --git a/small.ts");
  });

  test("terminates a patch that lacks a trailing newline (GitHub omits it)", () => {
    const patch = reconstructGhPatch([
      { filename: "a.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
      { filename: "b.ts", status: "modified", patch: "@@ -1 +1 @@\n-c\n+d" },
    ]);

    expect(patch).toContain("+b\ndiff --git a/b.ts b/b.ts");
  });

  test("leaves paths with bare spaces unquoted — git parity, so the header parser round-trips them", () => {
    // Git only C-quotes paths containing quotes/backslashes/control chars.
    // Over-quoting (e.g. quoting spaces) breaks parseDiffGitHeader's regex
    // branch and silently drops files downstream.
    const patch = reconstructGhPatch([
      { filename: "docs/my file.md", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
    ]);

    const headerLine = patch.split("\n")[0];
    expect(headerLine).toBe("diff --git a/docs/my file.md b/docs/my file.md");
    expect(parseDiffGitHeader(headerLine)).toEqual({
      oldPath: "docs/my file.md",
      newPath: "docs/my file.md",
    });
  });

  test("pure rename with a space in the new name still yields parseable paths (file must not vanish)", () => {
    // Regression: GitHub omits `patch` for 100%-similarity renames; if the
    // header is unparseable the UI's file splitter drops the file silently.
    const patch = reconstructGhPatch([
      { filename: "docs/road map.md", previous_filename: "docs/roadmap.md", status: "renamed" },
    ]);

    const headerLine = patch.split("\n")[0];
    expect(headerLine).toBe("diff --git a/docs/roadmap.md b/docs/road map.md");
    expect(parseDiffGitHeader(headerLine)).toEqual({
      oldPath: "docs/roadmap.md",
      newPath: "docs/road map.md",
    });
  });

  test("C-quotes paths containing double quotes, matching git, and the parser round-trips them", () => {
    const patch = reconstructGhPatch([
      { filename: 'he"llo.ts', status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
    ]);

    const headerLine = patch.split("\n")[0];
    expect(headerLine).toBe('diff --git "a/he\\"llo.ts" "b/he\\"llo.ts"');
    expect(parseDiffGitHeader(headerLine)).toEqual({ oldPath: 'he"llo.ts', newPath: 'he"llo.ts' });
  });

  test("copied file emits copy metadata", () => {
    const patch = reconstructGhPatch([
      {
        filename: "copy.ts",
        previous_filename: "orig.ts",
        status: "copied",
        patch: "@@ -1 +1 @@\n-a\n+b",
      },
    ]);

    expect(patch).toContain("similarity index 99%");
    expect(patch).toContain("copy from orig.ts");
    expect(patch).toContain("copy to copy.ts");
    expect(patch.split("\n")[0]).toBe("diff --git a/orig.ts b/copy.ts");
  });
});
