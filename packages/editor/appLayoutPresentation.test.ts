import { describe, expect, test } from "bun:test";
import {
  buildAppLayoutPresentation,
  type BuildAppLayoutPresentationInput,
} from "./appLayoutPresentation";

const baseLayoutPresentationInput = {
  isAgentTerminalResizing: false,
  isLeftSidebarResizing: false,
  isRightSidebarResizing: false,
  wideModeType: null,
  isRightSidebarOpen: false,
  rightSidebarTab: "annotations",
  annotateSource: null,
  recentMessageCount: 0,
  messageAnnotationCount: 0,
  aiAvailable: false,
  hasAIContext: false,
  isAgentTerminalReady: false,
  aiMessages: [],
  aiConfig: { providerId: null, model: null, reasoningEffort: null },
} satisfies BuildAppLayoutPresentationInput;

describe("editor layout and sidebar presentation", () => {
  test("aggregates pane resizing and marks sidebars as wide mode", () => {
    const presentation = buildAppLayoutPresentation({
      ...baseLayoutPresentationInput,
      isLeftSidebarResizing: true,
      wideModeType: "wide",
      isRightSidebarOpen: true,
    });

    expect(presentation.isResizing).toBe(true);
    expect(presentation.leftSidebar.isWideMode).toBe(true);
    expect(presentation.rightSidebar.isWideMode).toBe(true);
  });

  test("shows message navigation only for multi-message annotation sessions", () => {
    const presentation = buildAppLayoutPresentation({
      ...baseLayoutPresentationInput,
      annotateSource: "message",
      recentMessageCount: 2,
      messageAnnotationCount: 1,
    });

    expect(presentation.leftSidebar.showMessagesTab).toBe(true);
    expect(presentation.leftSidebar.hasMessageAnnotations).toBe(true);
  });

  test("selects the active right panel and terminal-backed AI sidebar", () => {
    const input = {
      ...baseLayoutPresentationInput,
      isRightSidebarOpen: true,
      aiAvailable: true,
      hasAIContext: true,
      isAgentTerminalReady: true,
      aiMessages: [
        {
          question: { id: "question-1", prompt: "Question", createdAt: 1 },
          response: { questionId: "question-1", text: "Answer", isStreaming: false, createdAt: 2 },
        },
      ],
      aiConfig: { providerId: "provider", model: "model", reasoningEffort: null },
    };

    const annotationPresentation = buildAppLayoutPresentation({
      ...input,
      rightSidebarTab: "annotations",
    });

    const aiPresentation = buildAppLayoutPresentation({ ...input, rightSidebarTab: "ai" });

    expect(annotationPresentation.rightSidebar.isAnnotationPanelOpen).toBe(true);
    expect(annotationPresentation.rightSidebar.isAIChatOpen).toBe(false);
    expect(annotationPresentation.aiSidebar.canUseAskAI).toBe(true);
    expect(annotationPresentation.aiSidebar.visibleMessages).toEqual([]);
    expect(annotationPresentation.aiSidebar.visibleConfig.providerId).toBe("agent-terminal");
    expect(aiPresentation.rightSidebar.isAnnotationPanelOpen).toBe(false);
    expect(aiPresentation.rightSidebar.isAIChatOpen).toBe(true);
  });
});
