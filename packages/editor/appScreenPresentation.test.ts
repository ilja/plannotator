import { describe, expect, test } from "bun:test";
import { buildAppScreenPresentation } from "./appScreenPresentation";

const onAskAI = () => true;

const onBack = () => {};

const baseInput = {
  activeSourceDocument: null,
  activeSourceSave: null,
  isApiMode: true,
  isLoadingShared: false,
  isSharedSession: false,
  showExport: false,
  getCurrentFeedbackPayload: () => "feedback",
  canUseDocumentAskAI: false,
  onAskAI,
  showLookAndFeelAnnouncement: false,
  linkedDocumentIsActive: false,
  linkedDocumentPath: null,
  onLinkedDocumentBack: onBack,
  linkedDocumentLabel: undefined,
  linkedDocumentBackLabel: "document",
  linkedDocumentVariant: "breadcrumb" as const,
  annotateSource: null,
  recentMessages: [],
  selectedMessageId: null,
};

describe("editor screen presentation", () => {
  test("keeps inactive screen sections empty without evaluating hidden export feedback", () => {
    let generatedFeedback = false;

    const presentation = buildAppScreenPresentation({
      ...baseInput,
      getCurrentFeedbackPayload: () => {
        generatedFeedback = true;

        return "feedback";
      },
    });

    expect(generatedFeedback).toBe(false);
    expect(presentation.banners).toEqual({
      hasDiskConflict: false,
      conflictedFileName: "",
      hasMissingSourceFile: false,
      missingFileName: "",
    });
    expect(presentation.document).toEqual({
      activeSourceSaveFileName: null,
      activeSourceDocumentKey: null,
      showDemoBadge: false,
      linkedDocument: null,
      messagePickerInfo: undefined,
    });
    expect(presentation.dialogs.annotationsOutput).toBe("");
    expect(presentation.overlays.shouldShowLookAndFeelAnnouncement).toBe(false);
    expect(presentation.documentActions.onAskAI).toBeUndefined();
  });

  test("projects source, linked-document, message, and screen action policy", () => {
    const presentation = buildAppScreenPresentation({
      ...baseInput,
      activeSourceDocument: {
        basename: "plan.md",
        diskConflict: { text: "on-disk content" },
        missingOnDisk: true,
        key: "file:/repo/plan.md",
      },
      activeSourceSave: { basename: "plan.md" },
      isApiMode: false,
      showExport: true,
      showLookAndFeelAnnouncement: true,
      linkedDocumentIsActive: true,
      linkedDocumentPath: "/repo/reference.md",
      linkedDocumentLabel: "File",
      annotateSource: "message",
      recentMessages: [{ messageId: "first" }, { messageId: "second" }],
      selectedMessageId: "second",
      canUseDocumentAskAI: true,
    });

    expect(presentation.banners).toEqual({
      hasDiskConflict: true,
      conflictedFileName: "plan.md",
      hasMissingSourceFile: false,
      missingFileName: "plan.md",
    });
    expect(presentation.document).toEqual({
      activeSourceSaveFileName: "plan.md",
      activeSourceDocumentKey: "file:/repo/plan.md",
      showDemoBadge: true,
      linkedDocument: {
        filepath: "/repo/reference.md",
        onBack,
        label: "File",
        backLabel: "document",
        variant: "breadcrumb",
      },
      messagePickerInfo: { current: 2, total: 2 },
    });
    expect(presentation.dialogs.annotationsOutput).toBe("feedback");
    expect(presentation.overlays.shouldShowLookAndFeelAnnouncement).toBe(true);
    expect(presentation.documentActions.onAskAI).toBe(onAskAI);
  });

  test("keeps missing-file, demo, and announcement policy distinct", () => {
    const presentation = buildAppScreenPresentation({
      ...baseInput,
      activeSourceDocument: {
        basename: "deleted.md",
        diskConflict: undefined,
        missingOnDisk: true,
        key: "file:/repo/deleted.md",
      },
      isApiMode: false,
      isSharedSession: true,
      showLookAndFeelAnnouncement: true,
    });

    expect(presentation.banners.hasMissingSourceFile).toBe(true);
    expect(presentation.document.showDemoBadge).toBe(false);
    expect(presentation.overlays.shouldShowLookAndFeelAnnouncement).toBe(false);
  });
});
