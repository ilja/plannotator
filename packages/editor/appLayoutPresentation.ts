import type { AIChatEntry } from "@plannotator/ui/hooks/useAIChat";
import type { AnnotateSource } from "./appPresentation";
import type { EditorRightSidebarTab } from "./components/EditorRightSidebarPane";
import type { WideModeType } from "./wideMode";

/** AI provider selection displayed in the editor sidebar. */
export interface AppAISidebarConfig {
  readonly providerId: string | null;
  readonly model: string | null;
  readonly reasoningEffort: string | null;
}

/** Immutable App state required to derive layout and sidebar presentation. */
export interface BuildAppLayoutPresentationInput {
  readonly isAgentTerminalResizing: boolean;
  readonly isLeftSidebarResizing: boolean;
  readonly isRightSidebarResizing: boolean;
  readonly wideModeType: WideModeType | null;
  readonly isRightSidebarOpen: boolean;
  readonly rightSidebarTab: EditorRightSidebarTab;
  readonly annotateSource: AnnotateSource;
  readonly recentMessageCount: number;
  readonly messageAnnotationCount: number;
  readonly aiAvailable: boolean;
  readonly hasAIContext: boolean;
  readonly isAgentTerminalReady: boolean;
  readonly aiMessages: AIChatEntry[];
  readonly aiConfig: AppAISidebarConfig;
}

/** Read-only layout and sidebar facts derived without reading or mutating App state. */
export interface AppLayoutPresentation {
  readonly isResizing: boolean;
  readonly leftSidebar: {
    readonly isWideMode: boolean;
    readonly showMessagesTab: boolean;
    readonly hasMessageAnnotations: boolean;
  };
  readonly rightSidebar: {
    readonly isOpen: boolean;
    readonly isWideMode: boolean;
    readonly isAnnotationPanelOpen: boolean;
    readonly isAIChatOpen: boolean;
  };
  readonly aiSidebar: {
    readonly canUseAI: boolean;
    readonly canUseAskAI: boolean;
    readonly hasMessages: boolean;
    readonly visibleMessages: AIChatEntry[];
    readonly visibleConfig: AppAISidebarConfig;
  };
}

function isRightSidebarTabOpen(
  input: BuildAppLayoutPresentationInput,
  tab: EditorRightSidebarTab,
): boolean {
  return input.isRightSidebarOpen && input.rightSidebarTab === tab;
}

function buildAISidebarPresentation(input: BuildAppLayoutPresentationInput) {
  const canUseAI = input.aiAvailable && input.hasAIContext;
  const canUseAskAI = canUseAI || input.isAgentTerminalReady;

  return {
    canUseAI,
    canUseAskAI,
    hasMessages: !input.isAgentTerminalReady && input.aiMessages.length > 0,
    visibleMessages: input.isAgentTerminalReady ? [] : input.aiMessages,
    visibleConfig: input.isAgentTerminalReady
      ? { providerId: "agent-terminal", model: null, reasoningEffort: null }
      : input.aiConfig,
  };
}

/** Builds layout and sidebar display state from immutable App session values. */
export function buildAppLayoutPresentation(
  input: BuildAppLayoutPresentationInput,
): AppLayoutPresentation {
  const isWideMode = input.wideModeType !== null;

  return {
    isResizing:
      input.isAgentTerminalResizing || input.isLeftSidebarResizing || input.isRightSidebarResizing,
    leftSidebar: {
      isWideMode,
      showMessagesTab: input.annotateSource === "message" && input.recentMessageCount > 1,
      hasMessageAnnotations: input.messageAnnotationCount > 0,
    },
    rightSidebar: {
      isOpen: input.isRightSidebarOpen,
      isWideMode,
      isAnnotationPanelOpen: isRightSidebarTabOpen(input, "annotations"),
      isAIChatOpen: isRightSidebarTabOpen(input, "ai"),
    },
    aiSidebar: buildAISidebarPresentation(input),
  };
}
