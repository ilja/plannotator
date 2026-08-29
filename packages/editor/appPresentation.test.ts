import { describe, expect, test } from "bun:test";
import {
  buildAnnotationFeedbackHeading,
  buildAppDocumentPresentation,
  buildCompletionSubtitle,
  buildCompletionTitle,
  buildDraftBannerMessage,
  buildFeedbackLossDescription,
  getActionsLabelMode,
  getBackLabel,
  getPlanMaxWidth,
  getViewerContentKey,
} from "./appPresentation";

describe("editor presentation decisions", () => {
  test("describes draft and feedback loss with correct singular wording", () => {
    expect(buildDraftBannerMessage(1, "2 minutes ago", true)).toBe(
      "Found 1 annotation and unsent direct edits from 2 minutes ago. Would you like to restore them?",
    );
    expect(buildFeedbackLossDescription(2, true)).toBe("2 annotations and direct edits");
    expect(buildFeedbackLossDescription(0, false)).toBe("feedback");
  });

  test("selects document context labels by annotation source", () => {
    expect(getBackLabel("folder")).toBe("file list");
    expect(getBackLabel("file")).toBe("file");
    expect(getBackLabel("message")).toBe("message");
    expect(getBackLabel(null)).toBe("document");
    expect(buildAnnotationFeedbackHeading("message")).toBe("Message Feedback");
    expect(buildAnnotationFeedbackHeading("folder")).toBe("Folder Feedback");
  });

  test("builds stable viewer keys for linked documents, messages, and edited plans", () => {
    expect(getViewerContentKey(true, "/repo/reference.md", "file", null, 4)).toBe(
      "doc:/repo/reference.md",
    );
    expect(getViewerContentKey(false, null, "message", "message-1", 4)).toBe("msg:message-1");
    expect(getViewerContentKey(false, null, "file", null, 4)).toBe("plan:4");
  });

  test("builds document and presentation facts from the active session", () => {
    const presentation = buildAppDocumentPresentation({
      displayedMarkdown: "# Active file\n\nBody",
      rootMarkdown: "# Root plan",
      renderAs: "markdown",
      annotateSource: "folder",
      selectedMessageId: null,
      editGeneration: 2,
      activeSourceSaveEnabled: true,
      hasEditStats: false,
      linkedDocumentIsActive: true,
      isSharedSession: false,
      isSubmitted: false,
      canUseWideMode: true,
      wideModeType: "wide",
      planWidth: "wide",
      annotateMode: true,
      agentTerminalAvailable: true,
      isAgentTerminalOpen: false,
      isAgentTerminalRunning: true,
      sourceFilePath: "/repo/root.md",
      linkedDocumentPath: "/repo/active.md",
      isActiveFileVault: true,
      hasActiveFile: true,
    });

    expect(presentation.isHtmlSurface).toBe(false);
    expect(presentation.backLabel).toBe("file list");
    expect(presentation.viewerContentKey).toBe("doc:/repo/active.md");
    expect(presentation.annotateReaderMaxWidth).toBeNull();
    expect(presentation.canEditMarkdown).toBe(true);
    expect(presentation.showAgentTerminalControls).toBe(true);
    expect(presentation.shouldRenderAgentTerminal).toBe(false);
    expect(presentation.linkedDocumentLabel).toBeUndefined();
    expect(presentation.viewerCopyLabel).toBe("Copy file");
    expect(presentation.viewerOpenInAppPath).toBe("/repo/active.md");
    expect(presentation.showEmptyFolderPresentation).toBe(false);
  });

  test("chooses responsive label modes and plan widths at thresholds", () => {
    expect(getActionsLabelMode(800)).toBe("full");
    expect(getActionsLabelMode(799)).toBe("short");
    expect(getActionsLabelMode(680)).toBe("short");
    expect(getActionsLabelMode(679)).toBe("icon");
    expect(getPlanMaxWidth("compact")).toBe(832);
    expect(getPlanMaxWidth("wide")).toBe(1280);
  });

  test("builds completion copy for every terminal session state", () => {
    expect(buildCompletionTitle("exited")).toBe("Session Closed");
    expect(buildCompletionTitle("approved")).toBe("Approved");
    expect(buildCompletionTitle("denied")).toBe("Feedback Sent");
    expect(buildCompletionSubtitle("approved", "Ada", "file")).toBe("Ada will proceed.");
    expect(buildCompletionSubtitle("denied", "Ada", "folder")).toBe(
      "Ada will address your feedback on the files.",
    );
  });
});
