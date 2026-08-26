import { describe, expect, test } from "bun:test";

import {
  decodeFileBrowserErrorResponse,
  decodeFileBrowserSuccessResponse,
} from "./fileBrowserResponses";
import type { WorkspaceStatusPayload } from "@plannotator/shared/workspace-status";

const workspaceStatus = {
  available: true,
  rootPath: "/workspace",
  repoRoot: "/workspace",
  files: {
    "/workspace/plan.md": {
      path: "/workspace/plan.md",
      repoRelativePath: "plan.md",
      oldPath: "/workspace/old-plan.md",
      status: "renamed",
      additions: 3,
      deletions: 1,
      staged: true,
      unstaged: false,
    },
  },
  totals: { files: 1, additions: 3, deletions: 1 },
  error: "",
} satisfies WorkspaceStatusPayload;

describe("decodeFileBrowserSuccessResponse", () => {
  test("decodes empty and ordinary valid trees", () => {
    expect(decodeFileBrowserSuccessResponse({ tree: [] })).toEqual({ tree: [] });
    expect(
      decodeFileBrowserSuccessResponse({
        tree: [{ name: "plan.md", path: "plan.md", type: "file" }],
      }),
    ).toEqual({
      tree: [{ name: "plan.md", path: "plan.md", type: "file" }],
    });
  });

  test("rejects envelopes with a missing or non-array tree", () => {
    expect(decodeFileBrowserSuccessResponse({})).toBeUndefined();
    expect(decodeFileBrowserSuccessResponse({ tree: {} })).toBeUndefined();
    expect(decodeFileBrowserSuccessResponse(null)).toBeUndefined();
  });

  test("filters malformed root siblings", () => {
    expect(
      decodeFileBrowserSuccessResponse({
        tree: [
          { name: "one.md", path: "one.md", type: "file" },
          { name: 42, path: "broken.md", type: "file" },
          { name: "two.md", path: "two.md", type: "file" },
        ],
      }),
    ).toEqual({
      tree: [
        { name: "one.md", path: "one.md", type: "file" },
        { name: "two.md", path: "two.md", type: "file" },
      ],
    });
  });

  test("filters malformed descendants recursively while retaining valid siblings", () => {
    expect(
      decodeFileBrowserSuccessResponse({
        tree: [
          {
            name: "docs",
            path: "docs",
            type: "folder",
            children: [
              { name: "one.md", path: "docs/one.md", type: "file" },
              {
                name: "nested",
                path: "docs/nested",
                type: "folder",
                children: [
                  { name: "valid.md", path: "docs/nested/valid.md", type: "file" },
                  { name: "broken.md", path: 42, type: "file" },
                ],
              },
              { name: "broken.md", path: "docs/broken.md", type: "unknown" },
            ],
          },
        ],
      }),
    ).toEqual({
      tree: [
        {
          name: "docs",
          path: "docs",
          type: "folder",
          children: [
            { name: "one.md", path: "docs/one.md", type: "file" },
            {
              name: "nested",
              path: "docs/nested",
              type: "folder",
              children: [{ name: "valid.md", path: "docs/nested/valid.md", type: "file" }],
            },
          ],
        },
      ],
    });
  });

  test("removes an invalid parent without promoting its descendants", () => {
    expect(
      decodeFileBrowserSuccessResponse({
        tree: [
          {
            name: 42,
            path: "broken",
            type: "folder",
            children: [{ name: "valid.md", path: "broken/valid.md", type: "file" }],
          },
        ],
      }),
    ).toEqual({ tree: [] });
  });

  test("keeps an explicitly present children array after filtering", () => {
    expect(
      decodeFileBrowserSuccessResponse({
        tree: [{ name: "empty", path: "empty", type: "folder", children: [{ name: 42 }] }],
      }),
    ).toEqual({
      tree: [{ name: "empty", path: "empty", type: "folder", children: [] }],
    });
  });

  test("decodes a valid workspace status", () => {
    expect(
      decodeFileBrowserSuccessResponse({
        tree: [],
        workspaceStatus,
      }),
    ).toEqual({ tree: [], workspaceStatus });
  });

  test("omits an absent or malformed workspace status without discarding the tree", () => {
    expect(decodeFileBrowserSuccessResponse({ tree: [] })).toEqual({ tree: [] });
    expect(
      decodeFileBrowserSuccessResponse({
        tree: [{ name: "plan.md", path: "plan.md", type: "file" }],
        workspaceStatus: { available: true },
      }),
    ).toEqual({
      tree: [{ name: "plan.md", path: "plan.md", type: "file" }],
    });

    expect(
      decodeFileBrowserSuccessResponse({
        tree: [{ name: "plan.md", path: "plan.md", type: "file" }],
        workspaceStatus: {
          ...workspaceStatus,
          files: {
            "/workspace/plan.md": {
              ...workspaceStatus.files["/workspace/plan.md"],
              status: "invalid",
            },
          },
          totals: { files: "one", additions: 3, deletions: 1 },
        },
      }),
    ).toEqual({
      tree: [{ name: "plan.md", path: "plan.md", type: "file" }],
    });
  });
});

describe("decodeFileBrowserErrorResponse", () => {
  test("extracts only a string error", () => {
    expect(decodeFileBrowserErrorResponse({ error: "Invalid directory path" })).toBe(
      "Invalid directory path",
    );
  });

  test("rejects malformed error envelopes", () => {
    expect(decodeFileBrowserErrorResponse({})).toBeUndefined();
    expect(decodeFileBrowserErrorResponse({ error: 42 })).toBeUndefined();
    expect(decodeFileBrowserErrorResponse(null)).toBeUndefined();
  });
});
