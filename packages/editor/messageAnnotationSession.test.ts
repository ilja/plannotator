import { describe, expect, test } from "bun:test";
import { AnnotationType, type Annotation, type CodeAnnotation } from "@plannotator/ui/types";
import {
  buildMessageAnnotationCounts,
  countMessageAnnotations,
  createEmptyMessageAnnotationState,
  normalizeMessageAnnotationState,
  type MessageAnnotationState,
} from "./messageAnnotationSession";

const message = {
  messageId: "message-1",
  text: "Updated message",
  timestamp: "2026-03-16T10:00:00Z",
};

function annotation(id: string): Annotation {
  return {
    id,
    blockId: "block-1",
    startOffset: 0,
    endOffset: 1,
    type: AnnotationType.COMMENT,
    originalText: "text",
    createdA: 1,
  };
}

function codeAnnotation(id: string): CodeAnnotation {
  return {
    id,
    type: "comment",
    scope: "line",
    filePath: "/repo/file.ts",
    lineStart: 1,
    lineEnd: 1,
    side: "new",
    createdAt: 1,
  };
}

function state(overrides: Partial<MessageAnnotationState> = {}): MessageAnnotationState {
  return {
    messageId: "message-1",
    text: "Original message",
    linkedDocSession: {
      root: {
        markdown: "Original message",
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
    ...overrides,
  };
}

describe("message annotation session", () => {
  test("creates an empty immutable root document from a picker message", () => {
    expect(createEmptyMessageAnnotationState(message)).toEqual({
      messageId: "message-1",
      text: "Updated message",
      timestamp: "2026-03-16T10:00:00Z",
      linkedDocSession: {
        root: {
          markdown: "Updated message",
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
    });
  });

  test("normalizes a cached state from the picker source of truth without mutating its map", () => {
    const docs = new Map([
      [
        "/repo/reference.md",
        {
          ...state().linkedDocSession.root,
          markdown: "Reference",
        },
      ],
    ]);
    const cached = state({ linkedDocSession: { ...state().linkedDocSession, docs } });

    const normalized = normalizeMessageAnnotationState(cached, message);

    expect(normalized.text).toBe("Updated message");
    expect(normalized.linkedDocSession.root.markdown).toBe("Updated message");
    expect(normalized.linkedDocSession.docs).not.toBe(docs);
    expect(normalized.linkedDocSession.docs).toEqual(docs);
  });

  test("counts root, linked-document, attachment, and code annotations by message", () => {
    const annotated = state({
      linkedDocSession: {
        root: {
          ...state().linkedDocSession.root,
          annotations: [annotation("root")],
          globalAttachments: [{ path: "/root.png", name: "root.png" }],
        },
        docs: new Map([
          [
            "/repo/reference.md",
            {
              ...state().linkedDocSession.root,
              annotations: [annotation("linked")],
            },
          ],
        ]),
      },
      codeAnnotations: [codeAnnotation("code")],
    });

    expect(countMessageAnnotations(annotated)).toBe(4);
    expect(
      buildMessageAnnotationCounts(
        new Map([
          ["annotated", annotated],
          ["empty", state({ messageId: "empty" })],
        ]),
      ),
    ).toEqual(new Map([["annotated", 4]]));
  });
});
