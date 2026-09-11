import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";

import {
  DiffSwitchRequestSchema,
  DiffTypeSchema,
  FeedbackRequestSchema,
  GitAddRequestSchema,
  PrActionRequestSchema,
  PrDiffScopeRequestSchema,
  PrSwitchRequestSchema,
  PrViewedRequestSchema,
  WorkspaceDiffTypeSchema,
} from "./review-request-schemas";

describe("review request schemas", () => {
  test("DiffTypeSchema accepts Git types and rejects workspace types", () => {
    expect(Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)("uncommitted"))).toBe(
      "uncommitted",
    );
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)("worktree:feature")),
    ).toBe("worktree:feature");
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)("workspace-current")),
    ).toBeUndefined();
    expect(Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)(123))).toBeUndefined();
  });

  test("DiffTypeSchema rejects legacy JJ and P4 values", () => {
    for (const diffType of [
      "jj-current",
      "jj-last",
      "jj-line",
      "jj-all",
      "jj-evolog",
      "p4-default",
      "p4-changelist:123",
    ]) {
      expect(
        Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)(diffType)),
      ).toBeUndefined();
    }
  });

  test("WorkspaceDiffTypeSchema accepts workspace variants only", () => {
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(WorkspaceDiffTypeSchema)("workspace-current"),
      ),
    ).toBe("workspace-current");
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(WorkspaceDiffTypeSchema)("uncommitted")),
    ).toBeUndefined();
  });

  test("DiffSwitchRequestSchema validates diffType and optional fields", () => {
    const valid = Option.getOrUndefined(
      Schema.decodeUnknownOption(DiffSwitchRequestSchema)({
        diffType: "uncommitted",
        hideWhitespace: true,
        base: "main",
      }),
    );

    expect(valid?.diffType).toBe("uncommitted");
    expect(valid?.hideWhitespace).toBe(true);
    expect(valid?.base).toBe("main");

    // empty base is valid (resolveReviewBase handles it)
    const emptyBase = Option.getOrUndefined(
      Schema.decodeUnknownOption(DiffSwitchRequestSchema)({ diffType: "uncommitted", base: "" }),
    );

    expect(emptyBase?.base).toBe("");

    // missing diffType -> malformed
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(DiffSwitchRequestSchema)({})),
    ).toBeUndefined();
    // wrong type
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(DiffSwitchRequestSchema)({ diffType: 123 })),
    ).toBeUndefined();
    // hideWhitespace wrong type
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(DiffSwitchRequestSchema)({
          diffType: "uncommitted",
          hideWhitespace: "true",
        }),
      ),
    ).toBeUndefined();
  });

  test("PrDiffScopeRequestSchema validates layer and full-stack", () => {
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrDiffScopeRequestSchema)({ scope: "layer" }),
      )?.scope,
    ).toBe("layer");
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrDiffScopeRequestSchema)({ scope: "full-stack" }),
      )?.scope,
    ).toBe("full-stack");
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrDiffScopeRequestSchema)({ scope: "invalid" }),
      ),
    ).toBeUndefined();
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(PrDiffScopeRequestSchema)({})),
    ).toBeUndefined();
  });

  test("PrSwitchRequestSchema requires non-empty url", () => {
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrSwitchRequestSchema)({
          url: "https://github.com/org/repo/pull/1",
        }),
      )?.url,
    ).toBe("https://github.com/org/repo/pull/1");
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(PrSwitchRequestSchema)({ url: "" })),
    ).toBeUndefined();
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(PrSwitchRequestSchema)({})),
    ).toBeUndefined();
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(PrSwitchRequestSchema)({ url: 123 })),
    ).toBeUndefined();
  });

  test("GitAddRequestSchema validates filePath and optional undo", () => {
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(GitAddRequestSchema)({ filePath: "src/app.ts" }),
      )?.filePath,
    ).toBe("src/app.ts");
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(GitAddRequestSchema)({ filePath: "" })),
    ).toBeUndefined();
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(GitAddRequestSchema)({ filePath: 123 })),
    ).toBeUndefined();

    const withUndo = Option.getOrUndefined(
      Schema.decodeUnknownOption(GitAddRequestSchema)({ filePath: "src/app.ts", undo: true }),
    );

    expect(withUndo?.undo).toBe(true);
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(GitAddRequestSchema)({ filePath: "src/app.ts", undo: "true" }),
      ),
    ).toBeUndefined();
  });

  test("FeedbackRequestSchema validates optional fields", () => {
    const valid = Option.getOrUndefined(
      Schema.decodeUnknownOption(FeedbackRequestSchema)({
        feedback: "looks good",
        annotations: [],
        approved: true,
      }),
    );

    expect(valid?.feedback).toBe("looks good");
    // empty object is valid (all fields optional, defaults handled by handler)
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(FeedbackRequestSchema)({})),
    ).toBeDefined();
    // wrong type
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(FeedbackRequestSchema)({ feedback: 123 })),
    ).toBeUndefined();
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(FeedbackRequestSchema)({ approved: "true" }),
      ),
    ).toBeUndefined();
  });

  test("PrActionRequestSchema requires action, body and fileComments", () => {
    const valid = Option.getOrUndefined(
      Schema.decodeUnknownOption(PrActionRequestSchema)({
        action: "approve",
        body: "LGTM",
        fileComments: [],
      }),
    );

    expect(valid?.action).toBe("approve");
    // missing fileComments -> malformed (required on Bun)
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrActionRequestSchema)({ action: "approve", body: "hi" }),
      ),
    ).toBeUndefined();
    // invalid action
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrActionRequestSchema)({
          action: "invalid",
          body: "hi",
          fileComments: [],
        }),
      ),
    ).toBeUndefined();
    // fileComments wrong shape
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrActionRequestSchema)({
          action: "comment",
          body: "hi",
          fileComments: [{ path: "a.ts", line: "1", side: "LEFT", body: "hi" }],
        }),
      ),
    ).toBeUndefined();
  });

  test("PrViewedRequestSchema validates filePaths and viewed", () => {
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrViewedRequestSchema)({ filePaths: ["a.ts"], viewed: true }),
      )?.viewed,
    ).toBe(true);
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrViewedRequestSchema)({ filePaths: "a.ts", viewed: true }),
      ),
    ).toBeUndefined();
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrViewedRequestSchema)({ filePaths: [], viewed: "true" }),
      ),
    ).toBeUndefined();
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(PrViewedRequestSchema)({})),
    ).toBeUndefined();
  });
});
