import { describe, expect, test } from "bun:test";
import {
  getDisplayRepo,
  isSameProject,
  parsePRUrl,
  prRefFromMetadata,
  type PRMetadata,
  type PRRef,
} from "./pr-types";
import { getPRDiffScopeOptions, getPRStackInfo } from "./pr-stack";

describe("GitHub PR helpers", () => {
  test("parses GitHub PR URLs including nested suffixes", () => {
    const ref = parsePRUrl("https://github.com/backnotprop/plannotator/pull/364/files");

    expect(ref).toEqual({
      host: "github.com",
      owner: "backnotprop",
      repo: "plannotator",
      number: 364,
    });
  });

  test("parses GitHub Enterprise PR URLs", () => {
    const ref = parsePRUrl("https://ghe.company.com/org/repo/pull/99/files");

    expect(ref).toEqual({
      host: "ghe.company.com",
      owner: "org",
      repo: "repo",
      number: 99,
    });
  });

  test("parses GitHub Enterprise URLs on arbitrary hosts", () => {
    const ref = parsePRUrl("https://git.internal.corp/team/app/pull/5");

    expect(ref).toEqual({
      host: "git.internal.corp",
      owner: "team",
      repo: "app",
      number: 5,
    });
  });

  test("returns null for unsupported URLs", () => {
    expect(parsePRUrl("https://example.com/not-a-pr/123")).toBeNull();
    expect(parsePRUrl("")).toBeNull();
  });

  test("formats GitHub PR labels", () => {
    const githubMeta: PRMetadata = {
      host: "github.com",
      owner: "backnotprop",
      repo: "plannotator",
      number: 364,
      title: "GitHub PR",
      author: "backnotprop",
      baseBranch: "main",
      headBranch: "feature/github",
      baseSha: "base",
      headSha: "head",
      url: "https://github.com/backnotprop/plannotator/pull/364",
    };

    expect(getDisplayRepo(githubMeta)).toBe("backnotprop/plannotator");
  });

  test("reconstructs refs from metadata", () => {
    const githubMeta: PRMetadata = {
      host: "github.com",
      owner: "backnotprop",
      repo: "plannotator",
      number: 1,
      title: "GitHub PR",
      author: "backnotprop",
      baseBranch: "main",
      headBranch: "feature/github",
      baseSha: "base",
      headSha: "head",
      url: "https://github.com/backnotprop/plannotator/pull/1",
    };

    const githubRef = prRefFromMetadata(githubMeta);

    expect(githubRef).toEqual({
      host: "github.com",
      owner: "backnotprop",
      repo: "plannotator",
      number: 1,
    });
  });
});

describe("PR stack helpers", () => {
  const stackedMeta: PRMetadata = {
    host: "github.com",
    owner: "backnotprop",
    repo: "plannotator-stack-fixture",
    number: 3,
    title: "Validate user id",
    author: "backnotprop",
    baseBranch: "stack/auth-refactor",
    headBranch: "stack/validation",
    defaultBranch: "main",
    baseSha: "base",
    headSha: "head",
    url: "https://github.com/backnotprop/plannotator-stack-fixture/pull/3",
  };

  test("infers a stacked PR when the base branch differs from the default branch", () => {
    expect(getPRStackInfo(stackedMeta)).toEqual({
      isStacked: true,
      baseBranch: "stack/auth-refactor",
      defaultBranch: "main",
      label: "stack/validation stacked on stack/auth-refactor",
      source: "branch-inferred",
    });
  });

  test("does not infer a stack for the bottom PR targeting the default branch", () => {
    expect(
      getPRStackInfo({
        ...stackedMeta,
        number: 1,
        baseBranch: "main",
        headBranch: "stack/base-cleanup",
      }),
    ).toBeNull();
  });

  test("only enables full-stack scope when stacked metadata has a local checkout", () => {
    expect(getPRDiffScopeOptions(stackedMeta, true)).toEqual([
      {
        id: "layer",
        label: "Layer",
        description: "Only changes relative to stack/auth-refactor.",
        enabled: true,
      },
      {
        id: "full-stack",
        label: "Full stack",
        description: "All changes from main to HEAD in the local checkout.",
        enabled: true,
      },
    ]);

    expect(getPRDiffScopeOptions(stackedMeta, false)[1].enabled).toBe(false);
  });
});

describe("isSameProject", () => {
  const ghRef: PRRef = {
    host: "github.com",
    owner: "acme",
    repo: "widgets",
    number: 1,
  };
  test("same GitHub project", () => {
    expect(isSameProject(ghRef, { ...ghRef, number: 99 })).toBe(true);
  });

  test("different GitHub owner", () => {
    expect(isSameProject(ghRef, { ...ghRef, owner: "other" })).toBe(false);
  });

  test("different GitHub repo", () => {
    expect(isSameProject(ghRef, { ...ghRef, repo: "gadgets" })).toBe(false);
  });

  test("different GitHub host", () => {
    expect(isSameProject(ghRef, { ...ghRef, host: "ghe.corp.com" })).toBe(false);
  });
});
