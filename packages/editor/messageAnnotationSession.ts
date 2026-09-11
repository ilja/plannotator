import type { CodeAnnotation } from "@plannotator/ui/types";
import type { PickerMessage } from "@plannotator/ui/components/sidebar/MessagesBrowser";
import type { LinkedDocSessionState } from "@plannotator/ui/hooks/useLinkedDoc";

export type MessageAnnotationState = {
  messageId: string;
  text: string;
  timestamp?: string;
  linkedDocSession: LinkedDocSessionState;
  codeAnnotations: CodeAnnotation[];
  selectedCodeAnnotationId: string | null;
};

function countLinkedDocSessionAnnotations(session: LinkedDocSessionState): number {
  let total = session.root.annotations.length + session.root.globalAttachments.length;

  for (const document of session.docs.values()) {
    total += document.annotations.length + document.globalAttachments.length;
  }

  return total;
}

export function countMessageAnnotations(state: MessageAnnotationState): number {
  return countLinkedDocSessionAnnotations(state.linkedDocSession) + state.codeAnnotations.length;
}

export function createEmptyMessageAnnotationState(message: PickerMessage): MessageAnnotationState {
  return {
    messageId: message.messageId,
    text: message.text,
    timestamp: message.timestamp,
    linkedDocSession: {
      root: {
        markdown: message.text,
        renderAs: "markdown",
        rawHtml: "",
        shareHtml: "",
        annotations: [],
        selectedAnnotationId: null,
        globalAttachments: [],
      },
      docs: new Map(),
    },
    codeAnnotations: [],
    selectedCodeAnnotationId: null,
  };
}

export function normalizeMessageAnnotationState(
  state: MessageAnnotationState,
  message: PickerMessage,
): MessageAnnotationState {
  return {
    ...state,
    text: message.text,
    timestamp: message.timestamp,
    linkedDocSession: {
      root: {
        ...state.linkedDocSession.root,
        // The root document for a message is immutable and comes from the picker.
        // Keep it as the source of truth so transient UI state cannot cache an
        // empty markdown value for a message.
        markdown: message.text,
        renderAs: state.linkedDocSession.root.renderAs ?? "markdown",
        rawHtml: state.linkedDocSession.root.rawHtml ?? "",
        shareHtml: state.linkedDocSession.root.shareHtml ?? "",
      },
      docs: new Map(state.linkedDocSession.docs),
    },
  };
}

export function buildMessageAnnotationCounts(
  states: Map<string, MessageAnnotationState>,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const [messageId, state] of states) {
    const count = countMessageAnnotations(state);

    if (count > 0) counts.set(messageId, count);
  }

  return counts;
}
