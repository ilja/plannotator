import { describe, expect, test } from "bun:test";
import {
  buildAppSubmissionCompletionPresentation,
  buildAppTerminalDocumentPresentation,
  buildAppTerminalFeedbackPresentation,
  buildEditorFeedbackRequest,
  type BuildAppTerminalDocumentPresentationInput,
} from "./appTerminalSubmissionPresentation";

const baseTerminalDocumentInput = {
  linkedDocumentIsActive: false,
  linkedDocumentPath: null,
  linkedDocumentIsConverted: false,
  sourceFilePath: undefined,
  activeFilePath: null,
  annotateMode: false,
  annotateSource: null,
  sourceInfo: undefined,
  sourceConverted: false,
} satisfies BuildAppTerminalDocumentPresentationInput;

describe("editor terminal and submission presentation", () => {
  test("shows terminal delivery only when the current feedback payload was delivered", () => {
    const delivery = { terminalSessionId: 4, feedbackKey: "feedback", targetPath: "/repo/plan.md" };
    const delivered = buildAppTerminalFeedbackPresentation({
      annotateMode: true,
      hasFeedbackContent: true,
      deliveredTerminalFeedback: delivery,
      currentTerminalFeedback: delivery,
    });
    const stale = buildAppTerminalFeedbackPresentation({
      annotateMode: true,
      hasFeedbackContent: true,
      deliveredTerminalFeedback: delivery,
      currentTerminalFeedback: { ...delivery, feedbackKey: "changed" },
    });

    expect(delivered.isCurrentFeedbackDeliveredToAgent).toBe(true);
    expect(delivered.showAgentTerminalDeliveryStatus).toBe(true);
    expect(delivered.hasFeedbackToSend).toBe(false);
    expect(stale.isCurrentFeedbackDeliveredToAgent).toBe(false);
    expect(stale.showAgentTerminalDeliveryStatus).toBe(false);
    expect(stale.hasFeedbackToSend).toBe(true);
    expect(
      buildAppTerminalFeedbackPresentation({
        annotateMode: true,
        hasFeedbackContent: true,
        deliveredTerminalFeedback: null,
        currentTerminalFeedback: delivery,
      }).hasFeedbackToSend,
    ).toBe(true);
  });

  test("prioritizes linked, source, and active file paths for terminal document context", () => {
    expect(
      buildAppTerminalDocumentPresentation({
        ...baseTerminalDocumentInput,
        linkedDocumentIsActive: true,
        linkedDocumentPath: "/repo/linked.md",
        sourceFilePath: "/repo/source.md",
        activeFilePath: "/repo/active.md",
        sourceInfo: "Source document",
        sourceConverted: true,
      }),
    ).toEqual({
      terminalAskReadableFilePath: "/repo/linked.md",
      aiDocumentPath: "/repo/linked.md",
      aiSourceInfo: "/repo/linked.md",
      aiSourceConverted: false,
      hasAIDocumentContext: true,
    });
    expect(
      buildAppTerminalDocumentPresentation({
        ...baseTerminalDocumentInput,
        sourceFilePath: "/repo/source.md",
        activeFilePath: "/repo/active.md",
      }).terminalAskReadableFilePath,
    ).toBe("/repo/source.md");
    expect(
      buildAppTerminalDocumentPresentation({
        ...baseTerminalDocumentInput,
        activeFilePath: "/repo/active.md",
      }).terminalAskReadableFilePath,
    ).toBe("/repo/active.md");
    expect(
      buildAppTerminalDocumentPresentation({
        ...baseTerminalDocumentInput,
        annotateSource: "message",
      }).aiDocumentPath,
    ).toBe("agent message");
  });

  test("scopes single and multi-message feedback requests without mutation", () => {
    const annotations = Object.freeze([]);
    const codeAnnotations = Object.freeze([]);
    const singleMessageRequest = buildEditorFeedbackRequest({
      draftGeneration: 1,
      feedback: "Fix the introduction",
      annotations,
      codeAnnotations,
      messageMultiSelectMode: true,
      annotatedMessageIds: ["message-1"],
      selectedMessageId: "message-2",
    });
    const multipleMessageRequest = buildEditorFeedbackRequest({
      draftGeneration: 1,
      feedback: "Fix the introduction",
      annotations,
      codeAnnotations,
      messageMultiSelectMode: true,
      annotatedMessageIds: ["message-1", "message-2"],
      selectedMessageId: "message-1",
    });
    const selectedMessageRequest = buildEditorFeedbackRequest({
      draftGeneration: 1,
      feedback: "Fix the introduction",
      annotations,
      codeAnnotations,
      messageMultiSelectMode: false,
      annotatedMessageIds: [],
      selectedMessageId: "message-2",
    });

    expect(singleMessageRequest.selectedMessageId).toBe("message-1");
    expect(singleMessageRequest.feedbackScope).toBeUndefined();
    expect(multipleMessageRequest.selectedMessageId).toBeUndefined();
    expect(multipleMessageRequest.feedbackScope).toBe("messages");
    expect(selectedMessageRequest.selectedMessageId).toBe("message-2");
    expect(singleMessageRequest.annotations).toBe(annotations);
    expect(singleMessageRequest.codeAnnotations).toBe(codeAnnotations);
  });

  test("derives callback readiness and completion state", () => {
    const callbackWithHtml = buildAppSubmissionCompletionPresentation({
      submitted: "approved",
      agentName: "Ada",
      annotateSource: "file",
      callbackConfigured: true,
      shareUrl: "",
      shortShareUrl: undefined,
      renderAs: "html",
      shareHtml: "<article>Plan</article>",
      rawHtml: "",
      hasAnyAnnotations: false,
      hasDirectEdits: true,
      hasSavedFileChanges: false,
    });
    const callbackWithUrl = buildAppSubmissionCompletionPresentation({
      submitted: null,
      agentName: "Ada",
      annotateSource: "file",
      callbackConfigured: true,
      shareUrl: "https://plannotator.ai/share/example",
      shortShareUrl: undefined,
      renderAs: "markdown",
      shareHtml: "",
      rawHtml: "",
      hasAnyAnnotations: false,
      hasDirectEdits: false,
      hasSavedFileChanges: false,
    });
    const unavailableConfiguredCallback = buildAppSubmissionCompletionPresentation({
      submitted: null,
      agentName: "Ada",
      annotateSource: "file",
      callbackConfigured: true,
      shareUrl: "",
      shortShareUrl: undefined,
      renderAs: "markdown",
      shareHtml: "",
      rawHtml: "",
      hasAnyAnnotations: false,
      hasDirectEdits: false,
      hasSavedFileChanges: false,
    });
    const unconfigured = buildAppSubmissionCompletionPresentation({
      submitted: null,
      agentName: "Ada",
      annotateSource: "file",
      callbackConfigured: false,
      shareUrl: "",
      shortShareUrl: undefined,
      renderAs: "markdown",
      shareHtml: "",
      rawHtml: "",
      hasAnyAnnotations: false,
      hasDirectEdits: false,
      hasSavedFileChanges: true,
    });

    expect(callbackWithHtml.callbackShareUrlReady).toBe(true);
    expect(callbackWithUrl.callbackShareUrlReady).toBe(true);
    expect(unavailableConfiguredCallback.callbackShareUrlReady).toBe(false);
    expect(callbackWithHtml.hasHeaderFeedback).toBe(true);
    expect(callbackWithHtml.completion).toEqual({
      submitted: "approved",
      agentName: "Ada",
      annotateSource: "file",
    });
    expect(unconfigured.callbackShareUrlReady).toBe(true);
    expect(unconfigured.hasHeaderFeedback).toBe(true);
    expect(unconfigured.completion.submitted).toBeNull();
  });
});
