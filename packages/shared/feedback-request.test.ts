import { describe, expect, test } from "bun:test";

import { decodeAnnotateFeedbackRequest, decodeReviewFeedbackRequest } from "./feedback-request";

describe("decodeReviewFeedbackRequest", () => {
  test("accepts the live approval payload (approval with LGTM text)", () => {
    expect(
      decodeReviewFeedbackRequest({
        draftGeneration: 3,
        approved: true,
        feedback: "LGTM - no changes requested.",
        annotations: [],
      }),
    ).toBeDefined();
  });

  test("accepts bare approval", () => {
    expect(decodeReviewFeedbackRequest({ approved: true })).toBeDefined();
  });

  test("accepts comments and annotations-only feedback", () => {
    expect(
      decodeReviewFeedbackRequest({ approved: false, feedback: "fix this", annotations: [] }),
    ).toBeDefined();
    expect(
      decodeReviewFeedbackRequest({ approved: false, feedback: "", annotations: [{ id: 1 }] }),
    ).toBeDefined();
  });

  test("rejects contentless bodies that would decide nothing", () => {
    expect(decodeReviewFeedbackRequest({})).toBeUndefined();
    expect(decodeReviewFeedbackRequest({ draftGeneration: 3 })).toBeUndefined();
    expect(decodeReviewFeedbackRequest({ approved: false })).toBeUndefined();
    expect(decodeReviewFeedbackRequest({ approved: false, feedback: "" })).toBeUndefined();
  });

  test("rejects the other endpoint's fields instead of stripping them", () => {
    expect(
      decodeReviewFeedbackRequest({ approved: true, selectedMessageId: "m1" }),
    ).toBeUndefined();
    expect(
      decodeReviewFeedbackRequest({ approved: false, feedback: "x", feedbackScope: "messages" }),
    ).toBeUndefined();
  });

  test("rejects wrong types", () => {
    expect(decodeReviewFeedbackRequest({ feedback: 123 })).toBeUndefined();
    expect(decodeReviewFeedbackRequest({ approved: "true" })).toBeUndefined();
    expect(decodeReviewFeedbackRequest([])).toBeUndefined();
  });
});

describe("decodeAnnotateFeedbackRequest", () => {
  test("accepts the live editor payload (text plus optional scope)", () => {
    // `codeAnnotations` arrives as stripped excess keys.
    expect(
      decodeAnnotateFeedbackRequest({
        draftGeneration: 1,
        feedback: "needs work",
        annotations: [],
        codeAnnotations: [],
      }),
    ).toBeDefined();
    expect(
      decodeAnnotateFeedbackRequest({
        draftGeneration: 1,
        feedback: "needs work",
        annotations: [],
        selectedMessageId: "m1",
      }),
    ).toBeDefined();
  });

  test("accepts scope-only multi-select payloads without a single message id", () => {
    expect(
      decodeAnnotateFeedbackRequest({ feedback: "compare these", feedbackScope: "messages" }),
    ).toBeDefined();
  });

  test("accepts annotations-only feedback", () => {
    expect(decodeAnnotateFeedbackRequest({ feedback: "", annotations: [{ id: 1 }] })).toBeDefined();
  });

  test("rejects contentless bodies", () => {
    expect(decodeAnnotateFeedbackRequest({})).toBeUndefined();
    expect(decodeAnnotateFeedbackRequest({ draftGeneration: 2 })).toBeUndefined();
    expect(
      decodeAnnotateFeedbackRequest({ feedback: "", annotations: [], feedbackScope: "messages" }),
    ).toBeUndefined();
  });

  test("rejects approval instead of silently ignoring it", () => {
    expect(decodeAnnotateFeedbackRequest({ approved: true, feedback: "LGTM" })).toBeUndefined();
    expect(decodeAnnotateFeedbackRequest({ approved: false, feedback: "no" })).toBeUndefined();
  });
});
