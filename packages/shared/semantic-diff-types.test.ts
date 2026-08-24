import { describe, expect, test } from "bun:test";

import { decodeSemanticDiffResponse } from "./semantic-diff-types";

const summary = {
  fileCount: 0,
  added: 0,
  modified: 0,
  deleted: 0,
  moved: 0,
  renamed: 0,
  reordered: 0,
  binary: 0,
  orphan: 0,
  total: 0,
};

const change = {
  entityId: null,
  changeType: "",
  entityType: "",
  entityName: "",
  oldEntityName: null,
  filePath: "",
  oldFilePath: null,
  startLine: null,
  endLine: null,
  oldStartLine: null,
  oldEndLine: null,
  structuralChange: null,
};

describe("decodeSemanticDiffResponse", () => {
  test("decodes every semantic diff status envelope", () => {
    expect(decodeSemanticDiffResponse({
      status: "ok",
      summary,
      changes: [change],
      binaryChanges: [{ changeType: "binary", filePath: "", oldFilePath: null, fileStatus: null }],
      semVersion: "",
      semSource: "",
    })).toEqual({
      status: "ok",
      summary,
      changes: [change],
      binaryChanges: [{ changeType: "binary", filePath: "", oldFilePath: null, fileStatus: null }],
      semVersion: "",
      semSource: "",
    });

    expect(decodeSemanticDiffResponse({
      status: "unavailable",
      reason: "",
      message: "",
    })).toEqual({ status: "unavailable", reason: "", message: "" });

    expect(decodeSemanticDiffResponse({
      status: "error",
      reason: "",
      message: "",
    })).toEqual({ status: "error", reason: "", message: "" });
  });

  test("preserves optional error fields when present", () => {
    expect(decodeSemanticDiffResponse({
      status: "error",
      reason: "sem-exit",
      message: "failed",
      exitCode: 2,
      stderr: "stderr",
      semVersion: "0.8.0",
      semSource: "path",
    })).toEqual({
      status: "error",
      reason: "sem-exit",
      message: "failed",
      exitCode: 2,
      stderr: "stderr",
      semVersion: "0.8.0",
      semSource: "path",
    });
  });

  test("rejects malformed response roots and status-specific fields", () => {
    expect(() => decodeSemanticDiffResponse([])).toThrow();
    expect(() => decodeSemanticDiffResponse({ status: "ok" })).toThrow();
    expect(() => decodeSemanticDiffResponse({
      status: "unavailable",
      reason: "missing",
      message: 1,
    })).toThrow();
  });

  test("retains valid changes around malformed sibling records", () => {
    const before = { ...change, entityName: "before" };
    const after = { ...change, entityName: "after" };

    expect(decodeSemanticDiffResponse({
      status: "ok",
      summary,
      changes: [before, { ...change, filePath: 1 }, after],
      binaryChanges: [],
      semVersion: "0.8.0",
      semSource: "path",
    }).changes).toEqual([before, after]);
  });

  test("retains valid binary changes around malformed sibling records", () => {
    const before = { changeType: "binary", filePath: "before.png", oldFilePath: null, fileStatus: null };
    const after = { changeType: "binary", filePath: "after.png", oldFilePath: null, fileStatus: null };

    expect(decodeSemanticDiffResponse({
      status: "ok",
      summary,
      changes: [],
      binaryChanges: [before, { ...before, filePath: 1 }, after],
      semVersion: "0.8.0",
      semSource: "path",
    }).binaryChanges).toEqual([before, after]);
  });
});
