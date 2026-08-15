import { afterEach, describe, expect, test } from 'bun:test';
import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { disabledSourceSave } from '@plannotator/shared/source-save';
import { AnnotationType, type Annotation, type ImageAttachment } from '../types';
import type { ViewerHandle } from '../components/Viewer';
import { useLinkedDoc } from './useLinkedDoc';

const hasDom = typeof document !== 'undefined';
const unsupportedSourceSave = disabledSourceSave('unsupported-extension');

const annotation = (id: string, originalText: string): Annotation => ({
  id,
  blockId: 'block',
  startOffset: 0,
  endOffset: originalText.length,
  type: AnnotationType.COMMENT,
  originalText,
  createdA: 1,
});

type LinkedDocApi = ReturnType<typeof useLinkedDoc>;

const CHOICE_MARKDOWN = `Pick one

- Option A: Alpha
- Option B: Beta

Recommendation: Option B.`;

const LEGACY_CHOICE: Annotation = {
  id: 'ann-choice-legacy',
  blockId: 'block-0',
  startOffset: 0,
  endOffset: 4,
  type: AnnotationType.COMMENT,
  originalText: 'Beta',
  createdA: 1,
  choiceOptionLabel: 'B',
};

type Session = {
  current: () => {
    hook: LinkedDocApi;
    markdown: string;
    annotations: Annotation[];
    selectedAnnotationId: string | null;
    setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
    setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  };
  unmount: () => Promise<void>;
};

let roots: Root[] = [];
let containers: HTMLElement[] = [];

async function mountLinkedDoc(): Promise<Session> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);

  let latest: Session['current'] extends () => infer T ? T : never;
  function Harness() {
    const [markdown, setMarkdown] = useState('root markdown');
    const [annotations, setAnnotations] = useState<Annotation[]>([annotation('root', 'root')]);
    const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
    const [globalAttachments, setGlobalAttachments] = useState<ImageAttachment[]>([]);
    const viewerRef = useRef<ViewerHandle | null>(null);
    const hook = useLinkedDoc({
      markdown,
      annotations,
      selectedAnnotationId,
      globalAttachments,
      setMarkdown,
      setAnnotations,
      setSelectedAnnotationId,
      setGlobalAttachments,
      renderAs: 'markdown',
      rawHtml: '',
      shareHtml: '',
      setRenderAs: () => undefined,
      setRawHtml: () => undefined,
      setShareHtml: () => undefined,
      viewerRef,
      sidebar: { open: () => undefined },
      onDocumentLoaded: () => undefined,
    });
    latest = { hook, markdown, annotations, selectedAnnotationId, setAnnotations, setSelectedAnnotationId };
    return null;
  }

  await act(async () => {
    root.render(<Harness />);
  });

  return {
    current: () => latest,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
      roots = roots.filter((entry) => entry !== root);
      containers = containers.filter((entry) => entry !== container);
    },
  };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  for (const container of containers.splice(0)) container.remove();
});

describe('useLinkedDoc unsupported Markdown path', () => {
  test.skipIf(!hasDom)('keeps non-source Markdown in the linked-document cache path', async () => {
    const session = await mountLinkedDoc();
    const filepath = '/repo/docs/notes.md';
    const linkedAnnotation = annotation('linked', 'linked');

    await act(async () => {
      session.current().hook.openLoaded({
        filepath,
        markdown: 'linked markdown',
        sourceSave: unsupportedSourceSave,
      });
    });
    expect(session.current().markdown).toBe('linked markdown');

    await act(async () => {
      session.current().setAnnotations([linkedAnnotation]);
    });
    await act(async () => {
      session.current().hook.back();
    });
    expect(session.current().markdown).toBe('root markdown');

    await act(async () => {
      session.current().hook.openLoaded({
        filepath,
        markdown: 'changed server markdown',
        sourceSave: unsupportedSourceSave,
      });
    });
    expect(session.current().markdown).toBe('linked markdown');
    expect(session.current().annotations).toEqual([linkedAnnotation]);
    expect(session.current().hook.getDocAnnotations().get(filepath)?.markdown).toBe('linked markdown');

    await session.unmount();
  });

  test.skipIf(!hasDom)('reconciles invalid cached choices and clears the selected id', async () => {
    const session = await mountLinkedDoc();
    const filepath = '/repo/docs/choices.md';

    await act(async () => {
      session.current().hook.openLoaded({
        filepath,
        markdown: CHOICE_MARKDOWN,
        sourceSave: unsupportedSourceSave,
      });
    });
    await act(async () => {
      session.current().setAnnotations([LEGACY_CHOICE]);
      session.current().setSelectedAnnotationId(LEGACY_CHOICE.id);
    });
    await act(async () => {
      session.current().hook.back();
    });

    expect(session.current().hook.getDocAnnotations().get(filepath)?.annotations).toEqual([]);

    await act(async () => {
      session.current().hook.openLoaded({
        filepath,
        markdown: CHOICE_MARKDOWN,
        sourceSave: unsupportedSourceSave,
      });
    });
    expect(session.current().annotations).toEqual([]);
    expect(session.current().selectedAnnotationId).toBeNull();

    await session.unmount();
  });
});
