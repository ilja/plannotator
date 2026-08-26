import { describe, expect, test } from "bun:test";
import { Result } from "effect";
import { decodePRListResponse } from "./pr-list-response";

const validPullRequest = {
  id: "pr-42",
  number: 42,
  title: "Ship safe PR list decoding",
  author: "ilja",
  url: "https://github.com/backnotprop/plannotator/pull/42",
  state: "open",
};

describe("decodePRListResponse", () => {
  test("decodes valid PRs in source order", () => {
    const decoded = decodePRListResponse({
      prs: [
        validPullRequest,
        { ...validPullRequest, id: "pr-7", number: 7, state: "merged" },
        { ...validPullRequest, id: "pr-3", number: 3, state: "closed" },
      ],
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual([
        validPullRequest,
        { ...validPullRequest, id: "pr-7", number: 7, state: "merged" },
        { ...validPullRequest, id: "pr-3", number: 3, state: "closed" },
      ]);
    }
  });

  test("rejects malformed response envelopes", () => {
    for (const value of [null, [], {}, { prs: null }, { prs: {} }]) {
      expect(Result.isFailure(decodePRListResponse(value))).toBeTrue();
    }
  });

  test("retains valid PRs around malformed entries in source order", () => {
    const decoded = decodePRListResponse({
      prs: [
        { ...validPullRequest, id: "pr-3", number: 3 },
        { ...validPullRequest, id: "pr-invalid", number: "not-a-number" },
        "not-a-pr",
        { ...validPullRequest, id: "pr-1", number: 1, state: "closed" },
      ],
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual([
        { ...validPullRequest, id: "pr-3", number: 3 },
        { ...validPullRequest, id: "pr-1", number: 1, state: "closed" },
      ]);
    }
  });

  test("rejects entries missing selector fields", () => {
    const missingFieldEntries = [
      {
        number: 42,
        title: validPullRequest.title,
        author: validPullRequest.author,
        url: validPullRequest.url,
        state: "open",
      },
      {
        id: validPullRequest.id,
        title: validPullRequest.title,
        author: validPullRequest.author,
        url: validPullRequest.url,
        state: "open",
      },
      {
        id: validPullRequest.id,
        number: 42,
        author: validPullRequest.author,
        url: validPullRequest.url,
        state: "open",
      },
      {
        id: validPullRequest.id,
        number: 42,
        title: validPullRequest.title,
        url: validPullRequest.url,
        state: "open",
      },
      {
        id: validPullRequest.id,
        number: 42,
        title: validPullRequest.title,
        author: validPullRequest.author,
        state: "open",
      },
      {
        id: validPullRequest.id,
        number: 42,
        title: validPullRequest.title,
        author: validPullRequest.author,
        url: validPullRequest.url,
      },
    ];

    for (const entry of missingFieldEntries) {
      const decoded = decodePRListResponse({ prs: [entry] });
      expect(Result.isSuccess(decoded)).toBeTrue();
      if (Result.isSuccess(decoded)) expect(decoded.success).toEqual([]);
    }
  });

  test("rejects entries with malformed selector fields", () => {
    const invalidEntries = [
      { ...validPullRequest, id: 42 },
      { ...validPullRequest, number: "42" },
      { ...validPullRequest, title: 42 },
      { ...validPullRequest, author: 42 },
      { ...validPullRequest, url: 42 },
      { ...validPullRequest, state: "draft" },
    ];

    for (const entry of invalidEntries) {
      const decoded = decodePRListResponse({ prs: [entry] });
      expect(Result.isSuccess(decoded)).toBeTrue();
      if (Result.isSuccess(decoded)) expect(decoded.success).toEqual([]);
    }
  });
});
