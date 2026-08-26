import { describe, expect, test } from "bun:test";
import type {
  SourceBackedDocumentDraftData,
  SourceBackedDraftSourceSaveCapability,
  SourceBackedSavedFileChangeDraftData,
} from "@plannotator/shared/draft";
import { AnnotationType, type Annotation, type CodeAnnotation } from "../types";
import {
  decodeStoredAnnotationDraft,
  decodeStoredDraftGeneration,
} from "./annotationDraftDecoding";

const annotation = {
  id: "annotation-1",
  blockId: "block-1",
  startOffset: 0,
  endOffset: 4,
  type: AnnotationType.COMMENT,
  text: "Comment",
  originalText: "Plan",
  createdA: 1718000000000,
  author: "tater",
};

const codeAnnotation: CodeAnnotation = {
  id: "code-1",
  type: "comment",
  filePath: "src/index.ts",
  lineStart: 4,
  lineEnd: 4,
  side: "new",
  text: "Check this",
  createdAt: 1718000000000,
};

const sourceSave: SourceBackedDraftSourceSaveCapability = {
  enabled: true,
  kind: "local-text-file",
  scope: "folder-file",
  path: "/repo/docs/plan.md",
  basename: "plan.md",
  language: "markdown",
  hash: "sha256:after",
  mtimeMs: 1718000001000,
  size: 6,
  eol: "lf",
};

const savedFileChange: SourceBackedSavedFileChangeDraftData = {
  key: "file:/repo/docs/plan.md",
  path: "/repo/docs/plan.md",
  basename: "plan.md",
  beforeText: "before\n",
  afterText: "after\n",
  beforeHash: "sha256:before",
  afterHash: "sha256:after",
  sourceSave,
};

const editedDocument: SourceBackedDocumentDraftData = {
  key: savedFileChange.key,
  sourceSave,
  sessionOpenText: savedFileChange.beforeText,
  diskBaseline: savedFileChange.afterText,
  currentText: "after\nmore work\n",
};

describe("decodeStoredDraftGeneration", () => {
  test("reads a generation from missing-draft response bodies", () => {
    expect(decodeStoredDraftGeneration({ draftGeneration: 4 })).toBe(4);
    expect(decodeStoredDraftGeneration({ draftGeneration: -1 })).toBeNull();
  });
});

describe("decodeStoredAnnotationDraft", () => {
  test("decodes a direct annotation draft", () => {
    expect(
      decodeStoredAnnotationDraft({
        annotations: [annotation],
        globalAttachments: [{ path: "/tmp/image.png", name: "image" }],
        draftGeneration: 3,
        ts: 1718000001000,
      }),
    ).toEqual({
      annotations: [annotation],
      codeAnnotations: [],
      globalAttachments: [{ path: "/tmp/image.png", name: "image" }],
      editedMarkdown: null,
      editedDocuments: [],
      savedFileChanges: [],
      draftGeneration: 3,
      ts: 1718000001000,
    });
  });

  test("preserves code-annotation-only drafts", () => {
    expect(
      decodeStoredAnnotationDraft({
        codeAnnotations: [codeAnnotation],
        globalAttachments: [],
        ts: 1718000001000,
      })?.codeAnnotations,
    ).toEqual([codeAnnotation]);
  });

  test("filters malformed array entries without discarding valid siblings", () => {
    const decoded = decodeStoredAnnotationDraft({
      annotations: [annotation, { id: "broken-annotation" }],
      codeAnnotations: [codeAnnotation, { id: "broken-code-annotation" }],
      globalAttachments: [
        { path: "/tmp/image.png", name: "image" },
        { path: 42, name: "broken" },
      ],
      ts: 1718000001000,
    });

    expect(decoded?.annotations).toEqual([annotation]);
    expect(decoded?.codeAnnotations).toEqual([codeAnnotation]);
    expect(decoded?.globalAttachments).toEqual([{ path: "/tmp/image.png", name: "image" }]);
  });

  test("preserves complete annotation and code-annotation records", () => {
    const fullAnnotation: Annotation = {
      ...annotation,
      source: "external-reviewer",
      images: [{ path: "/tmp/annotation.png", name: "annotation" }],
      isQuickLabel: true,
      quickLabelTip: "Explain why",
      choiceOptionLabel: "A",
      choiceValidationEvidence: {
        question: "Choose one",
        options: [{ label: "A", text: "First option" }],
      },
      diffContext: "modified",
      startMeta: { parentTagName: "P", parentIndex: 1, textOffset: 2 },
      endMeta: { parentTagName: "P", parentIndex: 1, textOffset: 6 },
    };
    const fullCodeAnnotation: CodeAnnotation = {
      ...codeAnnotation,
      type: "suggestion",
      scope: "line",
      images: [{ path: "/tmp/code.png", name: "code" }],
      suggestedCode: "const answer = 42;",
      originalCode: "const answer = 0;",
      charStart: 6,
      charEnd: 12,
      tokenText: "answer",
      author: "reviewer",
      source: "agent",
      severity: "important",
      reasoning: "The value is incorrect",
      reviewProfileLabel: "Correctness",
      conventionalLabel: "issue",
      decorations: ["blocking", "if-minor"],
      prUrl: "https://example.test/pull/1",
      prNumber: 1,
      prTitle: "Fix answer",
      prRepo: "example/repo",
      diffScope: "full-stack",
    };

    const decoded = decodeStoredAnnotationDraft({
      annotations: [fullAnnotation],
      codeAnnotations: [fullCodeAnnotation],
      globalAttachments: [],
      ts: 1718000001000,
    });

    expect(decoded?.annotations).toEqual([fullAnnotation]);
    expect(decoded?.codeAnnotations).toEqual([fullCodeAnnotation]);
  });

  test("keeps valid source drafts while filtering malformed nested records", () => {
    const decoded = decodeStoredAnnotationDraft({
      annotations: [],
      globalAttachments: [],
      editedDocuments: [
        { ...editedDocument, savedChange: { key: editedDocument.key } },
        { key: "broken-document" },
      ],
      savedFileChanges: [savedFileChange, { key: "broken-change" }],
      ts: 1718000001000,
    });

    expect(decoded?.editedDocuments).toEqual([editedDocument]);
    expect(decoded?.savedFileChanges).toEqual([savedFileChange]);
  });

  test("inherits document source metadata for historical nested saved changes", () => {
    const { sourceSave: _sourceSave, ...historicalSavedChange } = savedFileChange;
    const decoded = decodeStoredAnnotationDraft({
      annotations: [],
      globalAttachments: [],
      editedDocuments: [{ ...editedDocument, savedChange: historicalSavedChange }],
      ts: 1718000001000,
    });

    expect(decoded?.editedDocuments).toEqual([
      {
        ...editedDocument,
        savedChange: savedFileChange,
      },
    ]);
  });

  test("normalizes legacy tuple drafts", () => {
    const decoded = decodeStoredAnnotationDraft({
      a: [["C", "original text", "legacy comment", null]],
      ts: 1718000001000,
    });

    expect(decoded?.annotations).toHaveLength(1);
    expect(decoded?.annotations[0]?.originalText).toBe("original text");
    expect(decoded?.annotations[0]?.text).toBe("legacy comment");
    expect(decoded?.editedMarkdown).toBeNull();
  });

  test("keeps legacy tuples when timestamp metadata is missing or malformed", () => {
    const legacyAnnotations = [["C", "original text", "legacy comment", null]];

    expect(decodeStoredAnnotationDraft({ a: legacyAnnotations })?.ts).toBe(0);
    expect(decodeStoredAnnotationDraft({ a: legacyAnnotations, ts: "invalid" })?.ts).toBe(0);
    expect(
      decodeStoredAnnotationDraft({
        a: legacyAnnotations,
        ts: Number.POSITIVE_INFINITY,
      })?.ts,
    ).toBe(0);
  });

  test("preserves empty edited text and normalizes invalid metadata", () => {
    expect(
      decodeStoredAnnotationDraft({
        editedMarkdown: "",
        draftGeneration: -1,
        ts: "invalid",
      }),
    ).toEqual({
      annotations: [],
      codeAnnotations: [],
      globalAttachments: [],
      editedMarkdown: "",
      editedDocuments: [],
      savedFileChanges: [],
      draftGeneration: null,
      ts: 0,
    });
  });
});
