import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";

import {
  DiffSwitchRequestSchema,
  DiffTypeSchema,
  EditorAnnotationRequestSchema,
  GitAddRequestSchema,
  PrActionRequestSchema,
  PrDiffScopeRequestSchema,
  PrSwitchRequestSchema,
  PrViewedRequestSchema,
  WorkspaceDiffTypeSchema,
} from "./review-request";

describe("review request schemas", () => {
  test("DiffTypeSchema accepts Git types and rejects workspace types", () => {
    expect(Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)("uncommitted"))).toBe(
      "uncommitted",
    );
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)("worktree:/tmp/x")),
    ).toBe("worktree:/tmp/x");
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)("workspace-current")),
    ).toBeUndefined();
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

    expect(Option.getOrUndefined(Schema.decodeUnknownOption(DiffTypeSchema)(123))).toBeUndefined();
  });

  test("DiffSwitchRequestSchema pairs a diff type with options", () => {
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

  test("PrActionRequestSchema requires action and body; fileComments defaults downstream", () => {
    const valid = Option.getOrUndefined(
      Schema.decodeUnknownOption(PrActionRequestSchema)({
        action: "approve",
        body: "LGTM",
        fileComments: [],
      }),
    );

    expect(valid?.action).toBe("approve");
    // absent fileComments decodes; handlers default it to []
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrActionRequestSchema)({ action: "approve", body: "hi" }),
      ),
    ).toBeDefined();
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
      ),
    ).toBeDefined();
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrViewedRequestSchema)({ filePaths: "a.ts", viewed: true }),
      ),
    ).toBeUndefined();
  });

  test("PrSwitchRequestSchema requires a non-empty url", () => {
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PrSwitchRequestSchema)({ url: "https://x/pull/1" }),
      ),
    ).toBeDefined();
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

  test("PrDiffScopeRequestSchema accepts the two scopes", () => {
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
        Schema.decodeUnknownOption(PrDiffScopeRequestSchema)({ scope: "bogus" }),
      ),
    ).toBeUndefined();
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(PrDiffScopeRequestSchema)({})),
    ).toBeUndefined();
  });

  test("GitAddRequestSchema requires a non-empty filePath", () => {
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(GitAddRequestSchema)({ filePath: "src/app.ts" }),
      ),
    ).toBeDefined();
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

  test("EditorAnnotationRequestSchema requires the selection fields", () => {
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(EditorAnnotationRequestSchema)({
          filePath: "a.ts",
          selectedText: "x",
          lineStart: 1,
          lineEnd: 2,
        }),
      ),
    ).toBeDefined();
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(EditorAnnotationRequestSchema)({ filePath: "a.ts" }),
      ),
    ).toBeUndefined();
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
});
