import type { SourceSaveCapability } from "@plannotator/shared/source-save";
import type {
  EnabledSourceSaveCapability,
  SourceBackedDocumentSaveStatus,
} from "./sourceBackedDocuments";

/** Source-backed document values used to derive save controls in the editor. */
export interface SourceBackedSavePresentationDocument {
  readonly sourceSave: SourceSaveCapability | null;
  readonly saveStatus: SourceBackedDocumentSaveStatus;
  readonly currentText: string;
  readonly diskBaseline: string;
  readonly diskConflict: { readonly text: string } | undefined;
}

/** Immutable App state required to derive source-backed save control presentation. */
export interface BuildAppSourceBackedSavePresentationInput {
  readonly activeDocument: SourceBackedSavePresentationDocument | null;
  readonly isEditingMarkdown: boolean;
}

/** Read-only save control facts derived from the active source-backed document. */
export interface AppSourceBackedSavePresentation {
  readonly activeSourceSave: EnabledSourceSaveCapability | null;
  readonly activeSaveStatus: SourceBackedDocumentSaveStatus | undefined;
  readonly hasUnsavedDiskChanges: boolean;
  readonly emphasizeSave: boolean;
  readonly saveFailed: boolean;
  readonly canOverwriteDiskConflict: boolean;
  readonly cancelMode: boolean;
}

function getEnabledSourceSave(
  activeDocument: SourceBackedSavePresentationDocument | null,
): EnabledSourceSaveCapability | null {
  return activeDocument?.sourceSave?.enabled ? activeDocument.sourceSave : null;
}

/** Builds source-backed document save and edit-exit state without reading or mutating App state. */
export function buildAppSourceBackedSavePresentation(
  input: BuildAppSourceBackedSavePresentationInput,
): AppSourceBackedSavePresentation {
  const activeSourceSave = getEnabledSourceSave(input.activeDocument);
  const activeSaveStatus = input.activeDocument?.saveStatus;

  const hasUnsavedDiskChanges =
    activeSaveStatus === "dirty" ||
    activeSaveStatus === "conflict" ||
    activeSaveStatus === "error" ||
    activeSaveStatus === "missing";

  const emphasizeSave = hasUnsavedDiskChanges || activeSaveStatus === "saving";
  const saveFailed = activeSaveStatus === "conflict" || activeSaveStatus === "error";

  const activeSourceBufferDirty =
    activeSourceSave !== null &&
    input.activeDocument?.currentText !== input.activeDocument?.diskBaseline;

  const diskConflict = input.activeDocument?.diskConflict;

  const canOverwriteDiskConflict =
    activeSourceSave !== null &&
    diskConflict !== undefined &&
    input.activeDocument?.currentText !== diskConflict.text;

  return {
    activeSourceSave,
    activeSaveStatus,
    hasUnsavedDiskChanges,
    emphasizeSave,
    saveFailed,
    canOverwriteDiskConflict,
    cancelMode:
      input.isEditingMarkdown &&
      activeSourceSave !== null &&
      (activeSourceBufferDirty || activeSaveStatus === "conflict" || activeSaveStatus === "error"),
  };
}
