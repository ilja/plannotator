import { describe, expect, test } from "bun:test";
import type { PRMetadata } from "@plannotator/shared/pr-types";
import type { ReviewSubmission, SubmissionTarget } from "../components/ReviewSubmissionDialog";
import {
  buildPlatformReviewActionBody,
  selectPlatformReviewTargets,
} from "./platformReviewSubmission";

const prMetadata: PRMetadata = {
  host: "github.com",
  owner: "backnotprop",
  repo: "plannotator",
  number: 42,
  title: "Extract review submission helpers",
  author: "ilja",
  baseBranch: "main",
  headBranch: "feature/refactor",
  baseSha: "base",
  headSha: "head",
  url: "https://github.com/backnotprop/plannotator/pull/42",
};

function buildTarget(overrides: Partial<SubmissionTarget> = {}): SubmissionTarget {
  return {
    prUrl: prMetadata.url,
    prNumber: prMetadata.number,
    prTitle: prMetadata.title,
    prRepo: "backnotprop/plannotator",
    fileComments: [],
    fileScopedBody: "",
    fileCount: 0,
    annotationCount: 0,
    status: "pending",
    ...overrides,
  };
}

function buildPlan(targets: SubmissionTarget[]): ReviewSubmission {
  return { targets, orphans: [] };
}

describe("buildPlatformReviewActionBody", () => {
  test("keeps the general comment, review marker, and file-scoped content ordered", () => {
    expect(
      buildPlatformReviewActionBody(
        buildTarget({ fileScopedBody: "**src/App.tsx:** Please simplify this." }),
        "Overall, this needs a follow-up.",
      ),
    ).toBe(
      "Overall, this needs a follow-up.\n\nReview from Plannotator\n\n**src/App.tsx:** Please simplify this.",
    );
  });
});

describe("selectPlatformReviewTargets", () => {
  test("approves only the active pull request", () => {
    const activeTarget = buildTarget();
    const stackedTarget = buildTarget({
      prUrl: "https://github.com/backnotprop/plannotator/pull/41",
      prNumber: 41,
    });

    expect(
      selectPlatformReviewTargets(
        "approve",
        buildPlan([stackedTarget, activeTarget]),
        undefined,
        prMetadata,
      ),
    ).toEqual([activeTarget]);
  });

  test("creates an active pull request target for a general comment", () => {
    expect(
      selectPlatformReviewTargets("comment", buildPlan([]), "Looks good overall.", prMetadata),
    ).toEqual([buildTarget()]);
  });

  test("retains pending and successful targets when retrying comments", () => {
    const pendingTarget = buildTarget();
    const successfulTarget = buildTarget({
      prUrl: "https://github.com/backnotprop/plannotator/pull/41",
      prNumber: 41,
      status: "success",
    });
    const targets = [pendingTarget, successfulTarget];

    expect(selectPlatformReviewTargets("comment", buildPlan(targets), undefined, prMetadata)).toBe(
      targets,
    );
  });
});
