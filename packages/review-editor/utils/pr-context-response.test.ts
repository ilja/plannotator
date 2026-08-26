import { describe, expect, test } from "bun:test";
import { decodePRContextError, decodePRContextResponse } from "./pr-context-response";

const validComment = {
  id: "comment-1",
  author: "reviewer",
  body: "Please consider this.",
  createdAt: "2026-01-01T00:00:00Z",
  url: "https://github.com/example/project/pull/42#issuecomment-1",
};

const validReview = {
  id: "review-1",
  author: "reviewer",
  state: "APPROVED",
  body: "Looks good.",
  submittedAt: "2026-01-01T00:00:00Z",
  url: "https://github.com/example/project/pull/42#pullrequestreview-1",
};

const validThread = {
  id: "thread-1",
  isResolved: false,
  isOutdated: false,
  path: "src/index.ts",
  line: 12,
  startLine: 10,
  diffSide: "RIGHT",
  comments: [{ ...validComment, id: "thread-comment-1", diffHunk: "@@ -10,3 +10,3 @@" }],
};

const validContext = {
  body: "Please review this change.",
  state: "OPEN",
  isDraft: false,
  labels: [{ name: "enhancement", color: "0366d6" }],
  reviewDecision: "APPROVED",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  comments: [validComment],
  reviews: [validReview],
  reviewThreads: [validThread],
  checks: [
    {
      name: "build",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      workflowName: "CI",
      detailsUrl: "https://github.com/example/project/actions/runs/1",
    },
  ],
  linkedIssues: [
    {
      number: 7,
      url: "https://github.com/example/project/issues/7",
      repo: "example/project",
    },
  ],
};

describe("decodePRContextResponse", () => {
  test("decodes GitHub-shaped context and preserves nullable and optional fields", () => {
    expect(decodePRContextResponse(validContext)).toEqual(validContext);
    expect(
      decodePRContextResponse({
        ...validContext,
        reviews: [{ ...validReview, url: "" }],
      }).reviews,
    ).toEqual([{ ...validReview, url: "" }]);

    const reviewWithoutUrl = (() => {
      const { url: _url, ...review } = validReview;
      return review;
    })();

    expect(
      decodePRContextResponse({
        ...validContext,
        reviews: [reviewWithoutUrl],
        checks: [{ ...validContext.checks[0], conclusion: null }],
        reviewThreads: [{ ...validThread, line: null, startLine: null, diffSide: null }],
      }),
    ).toEqual({
      ...validContext,
      reviews: [
        {
          id: validReview.id,
          author: validReview.author,
          state: validReview.state,
          body: validReview.body,
          submittedAt: validReview.submittedAt,
        },
      ],
      checks: [{ ...validContext.checks[0], conclusion: null }],
      reviewThreads: [{ ...validThread, line: null, startLine: null, diffSide: null }],
    });
  });

  test("decodes GitLab-shaped context with empty label colors and nullable checks", () => {
    const { url: _url, ...reviewWithoutUrl } = validReview;
    const gitlabContext = {
      ...validContext,
      labels: [{ name: "bug", color: "" }],
      reviews: [reviewWithoutUrl],
      reviewThreads: [],
      checks: [{ ...validContext.checks[0], conclusion: null }],
    };

    expect(decodePRContextResponse(gitlabContext)).toEqual(gitlabContext);
  });

  test("rejects malformed successful envelopes and required scalar fields", () => {
    for (const value of [
      null,
      [],
      {},
      { ...validContext, body: 42 },
      { ...validContext, state: null },
      { ...validContext, isDraft: "false" },
      { ...validContext, reviewDecision: 42 },
      { ...validContext, mergeable: null },
      { ...validContext, mergeStateStatus: false },
    ]) {
      expect(() => decodePRContextResponse(value)).toThrow();
    }
  });

  test("filters malformed top-level array entries while retaining valid siblings", () => {
    const decoded = decodePRContextResponse({
      ...validContext,
      labels: [validContext.labels[0], { name: "missing color" }, "not-a-label"],
      comments: [validComment, { ...validComment, body: 42 }, "not-a-comment"],
      reviews: [validReview, { ...validReview, state: 42 }, "not-a-review"],
      checks: [
        validContext.checks[0],
        { ...validContext.checks[0], conclusion: 42 },
        "not-a-check",
      ],
      linkedIssues: [
        validContext.linkedIssues[0],
        { ...validContext.linkedIssues[0], number: "7" },
        "not-an-issue",
      ],
    });

    expect(decoded.labels).toEqual(validContext.labels);
    expect(decoded.comments).toEqual([validComment]);
    expect(decoded.reviews).toEqual([validReview]);
    expect(decoded.checks).toEqual(validContext.checks);
    expect(decoded.linkedIssues).toEqual(validContext.linkedIssues);
  });

  test("filters malformed thread comments without dropping valid threads or siblings", () => {
    const decoded = decodePRContextResponse({
      ...validContext,
      reviewThreads: [
        {
          ...validThread,
          comments: [
            validThread.comments[0],
            { ...validThread.comments[0], url: 42 },
            "not-a-comment",
          ],
        },
        { ...validThread, path: 42 },
        "not-a-thread",
      ],
    });

    expect(decoded.reviewThreads).toEqual([
      {
        ...validThread,
        comments: [validThread.comments[0]],
      },
    ]);
  });

  test("normalizes malformed array containers independently", () => {
    const { reviews: _reviews, ...contextWithoutReviews } = validContext;
    const decoded = decodePRContextResponse({
      ...contextWithoutReviews,
      labels: null,
      comments: "not-an-array",
      reviewThreads: {},
      checks: 42,
      linkedIssues: false,
    });

    expect(decoded).toMatchObject({
      body: validContext.body,
      labels: [],
      comments: [],
      reviews: [],
      reviewThreads: [],
      checks: [],
      linkedIssues: [],
    });
  });
});

describe("decodePRContextError", () => {
  test("decodes only a string error field", () => {
    expect(decodePRContextError({ error: "Authentication failed" })).toBe("Authentication failed");
    expect(decodePRContextError({ error: "" })).toBe("");
    expect(decodePRContextError({ error: 42 })).toBeUndefined();
    expect(decodePRContextError({ error: { message: "Do not trust this" } })).toBeUndefined();
    expect(decodePRContextError(null)).toBeUndefined();
  });
});
