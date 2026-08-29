import { describe, expect, test } from "bun:test";
import {
  buildAppSourceBackedSavePresentation,
  type BuildAppSourceBackedSavePresentationInput,
  type SourceBackedSavePresentationDocument,
} from "./appSourceBackedSavePresentation";

const enabledSourceSave = {
  enabled: true,
  kind: "local-text-file",
  scope: "single-file",
  path: "/repo/plan.md",
  basename: "plan.md",
  language: "markdown",
  hash: "hash",
  mtimeMs: 1,
  size: 10,
  eol: "lf",
} as const;

const activeDocument = (
  overrides: Partial<SourceBackedSavePresentationDocument> = {},
): SourceBackedSavePresentationDocument => ({
  sourceSave: enabledSourceSave,
  saveStatus: "clean",
  currentText: "Before",
  diskBaseline: "Before",
  diskConflict: undefined,
  ...overrides,
});

const baseInput = {
  activeDocument: null,
  isEditingMarkdown: false,
} satisfies BuildAppSourceBackedSavePresentationInput;

describe("source-backed save presentation", () => {
  test("keeps all save controls inactive without an enabled source document", () => {
    expect(buildAppSourceBackedSavePresentation(baseInput)).toEqual({
      activeSourceSave: null,
      activeSaveStatus: undefined,
      hasUnsavedDiskChanges: false,
      emphasizeSave: false,
      saveFailed: false,
      canOverwriteDiskConflict: false,
      cancelMode: false,
    });
  });

  test("reports dirty buffers and every unsaved save status", () => {
    const dirtyBuffer = buildAppSourceBackedSavePresentation({
      ...baseInput,
      activeDocument: activeDocument({ currentText: "After" }),
      isEditingMarkdown: true,
    });

    expect(dirtyBuffer.hasUnsavedDiskChanges).toBe(false);
    expect(dirtyBuffer.emphasizeSave).toBe(false);
    expect(dirtyBuffer.cancelMode).toBe(true);

    for (const saveStatus of ["dirty", "conflict", "error", "missing"] as const) {
      const presentation = buildAppSourceBackedSavePresentation({
        ...baseInput,
        activeDocument: activeDocument({ saveStatus }),
      });

      expect(presentation.hasUnsavedDiskChanges).toBe(true);
      expect(presentation.emphasizeSave).toBe(true);
      expect(presentation.saveFailed).toBe(saveStatus === "conflict" || saveStatus === "error");
    }
  });

  test("allows overwriting only a real disk conflict and emphasizes in-flight saves", () => {
    const conflict = activeDocument({
      saveStatus: "conflict",
      currentText: "Local edit",
      diskConflict: { text: "Disk edit", sourceSave: enabledSourceSave },
    });

    expect(
      buildAppSourceBackedSavePresentation({ ...baseInput, activeDocument: conflict })
        .canOverwriteDiskConflict,
    ).toBe(true);
    expect(
      buildAppSourceBackedSavePresentation({
        ...baseInput,
        activeDocument: activeDocument({
          saveStatus: "conflict",
          diskConflict: { text: "Before", sourceSave: enabledSourceSave },
        }),
      }).canOverwriteDiskConflict,
    ).toBe(false);
    expect(
      buildAppSourceBackedSavePresentation({
        ...baseInput,
        activeDocument: activeDocument({
          saveStatus: "saving",
          diskConflict: { text: "Before", sourceSave: enabledSourceSave },
        }),
      }).emphasizeSave,
    ).toBe(true);
  });
});
