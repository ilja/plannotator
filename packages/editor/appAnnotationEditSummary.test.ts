import { describe, expect, test } from "bun:test";
import type { DirectEditPanelItem } from "./directEdits";
import {
  buildAppAnnotationEditSummary,
  copyAnnotationEditSummaryPanelItemsForSidebar,
  type BuildAppAnnotationEditSummaryInput,
} from "./appAnnotationEditSummary";

const baseAnnotationEditSummaryInput = {
  annotateSource: null,
  recentMessageCount: 1,
  messageFeedbackAnnotationCount: 0,
  annotationCount: 0,
  codeAnnotationCount: 0,
  editorAnnotationCount: 0,
  linkedDocumentAnnotationCount: 0,
  globalAttachmentCount: 0,
  sharingEnabled: true,
  activeSourceSaveEnabled: false,
  unsavedSourceFileBufferCount: 0,
  isEditingMarkdown: false,
  editorDiffersFromBaseline: false,
  hasCommittedPlanEdit: false,
  savedFileChanges: [],
  hasEditStats: false,
  originalMarkdown: null,
  editedMarkdown: null,
} satisfies BuildAppAnnotationEditSummaryInput;

describe("editor annotation and edit summary", () => {
  test("uses message feedback counts instead of the current document in multi-message sessions", () => {
    const summary = buildAppAnnotationEditSummary({
      ...baseAnnotationEditSummaryInput,
      annotateSource: "message",
      recentMessageCount: 2,
      messageFeedbackAnnotationCount: 3,
      annotationCount: 8,
      codeAnnotationCount: 2,
      linkedDocumentAnnotationCount: 4,
      editorAnnotationCount: 1,
      globalAttachmentCount: 5,
    });

    expect(summary.messageMultiSelectMode).toBe(true);
    expect(summary.hasAnyAnnotations).toBe(true);
    expect(summary.feedbackAnnotationCount).toBe(4);
    expect(summary.hasUnsentFeedback).toBe(true);
  });

  test("aggregates every annotation surface for a single-document session", () => {
    const summary = buildAppAnnotationEditSummary({
      ...baseAnnotationEditSummaryInput,
      annotationCount: 1,
      codeAnnotationCount: 2,
      editorAnnotationCount: 3,
      linkedDocumentAnnotationCount: 4,
      globalAttachmentCount: 5,
    });

    expect(summary.messageMultiSelectMode).toBe(false);
    expect(summary.hasAnyAnnotations).toBe(true);
    expect(summary.feedbackAnnotationCount).toBe(15);
    expect(summary.feedbackLoss).toBe("15 annotations");
  });

  test("reports reviewable direct edits", () => {
    const summary = buildAppAnnotationEditSummary({
      ...baseAnnotationEditSummaryInput,
      isEditingMarkdown: true,
      editorDiffersFromBaseline: true,
    });

    expect(summary.hasDirectEdits).toBe(true);
    expect(summary.hasFeedbackContent).toBe(true);
    expect(summary.hasUnsentFeedback).toBe(true);
    expect(summary.feedbackLoss).toBe("direct edits");
    expect(summary.canShareCurrentSession).toBe(true);
  });

  test("disables sharing for code comments", () => {
    const summary = buildAppAnnotationEditSummary({
      ...baseAnnotationEditSummaryInput,
      codeAnnotationCount: 1,
    });

    expect(summary.canShareCurrentSession).toBe(false);
  });

  test("excludes source-backed buffers from direct feedback until they are saved", () => {
    const summary = buildAppAnnotationEditSummary({
      ...baseAnnotationEditSummaryInput,
      activeSourceSaveEnabled: true,
      unsavedSourceFileBufferCount: 1,
      isEditingMarkdown: true,
      editorDiffersFromBaseline: true,
    });

    expect(summary.hasDirectEdits).toBe(false);
    expect(summary.hasFeedbackContent).toBe(false);
    expect(summary.hasUnsentFeedback).toBe(false);
    expect(summary.directEditsPanelInfo).toBeNull();
  });

  test("prioritizes immutable saved-file changes over a plan edit card", () => {
    const savedFileChanges = Object.freeze([
      Object.freeze({
        key: "file:/repo/notes.md",
        path: "/repo/notes.md",
        basename: "notes.md",
        beforeText: "before\n",
        afterText: "after\n",
      }),
    ]);
    const summary = buildAppAnnotationEditSummary({
      ...baseAnnotationEditSummaryInput,
      savedFileChanges,
      hasEditStats: true,
      originalMarkdown: "plan before\n",
      editedMarkdown: "plan after\n",
    });

    expect(summary.hasSavedFileChanges).toBe(true);
    const panelItems: readonly Readonly<DirectEditPanelItem>[] | null =
      summary.directEditsPanelInfo;
    const sidebarPanelItems = copyAnnotationEditSummaryPanelItemsForSidebar(panelItems);
    expect(summary.directEditsPanelInfo).toHaveLength(1);
    expect(panelItems).toHaveLength(1);
    expect(sidebarPanelItems).toEqual(panelItems);
    expect(sidebarPanelItems).not.toBe(panelItems);
    expect(summary.directEditsPanelInfo?.[0]?.id).toBe("saved:file:/repo/notes.md");
    expect(savedFileChanges[0]?.beforeText).toBe("before\n");
  });

  test("builds a plan edit card only when complete direct-edit context exists", () => {
    const summary = buildAppAnnotationEditSummary({
      ...baseAnnotationEditSummaryInput,
      hasEditStats: true,
      originalMarkdown: "plan before\n",
      editedMarkdown: "plan after\n",
    });

    expect(summary.directEditsPanelInfo).toHaveLength(1);
    expect(summary.directEditsPanelInfo?.[0]?.id).toBe("plan");
  });
});
