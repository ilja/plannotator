import { describe, expect, test } from "bun:test";
import { parseReviewArgs } from "./review-args";

describe("parseReviewArgs", () => {
  test("defaults to local PR checkout", () => {
    expect(parseReviewArgs("")).toEqual({
      prUrl: undefined,
      useLocal: true,
    });
  });

  test("preserves --no-local for PR review mode", () => {
    expect(parseReviewArgs("--no-local https://github.com/acme/repo/pull/12")).toEqual({
      prUrl: "https://github.com/acme/repo/pull/12",
      useLocal: false,
    });
  });

  test("accepts argv arrays from the compiled CLI", () => {
    expect(parseReviewArgs(["--no-local", "https://github.com/acme/repo/pull/12"])).toEqual({
      prUrl: "https://github.com/acme/repo/pull/12",
      useLocal: false,
    });
  });

  test("strips wrapping quotes from string and argv inputs", () => {
    expect(parseReviewArgs(`"https://github.com/acme/repo/pull/12"`).prUrl).toBe(
      "https://github.com/acme/repo/pull/12",
    );
    expect(parseReviewArgs(['"https://github.com/acme/repo/pull/12"']).prUrl).toBe(
      "https://github.com/acme/repo/pull/12",
    );
  });

  test("keeps non-url positional input as local review mode", () => {
    expect(parseReviewArgs("not-a-url")).toEqual({
      prUrl: undefined,
      useLocal: true,
    });
  });
});
