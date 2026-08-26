import { afterEach, describe, expect, test } from 'bun:test';
import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { disabledSourceSave } from '@plannotator/shared/source-save';
import { AnnotationType, type Annotation, type ImageAttachment } from '../types';
import type { ViewerHandle } from '../components/Viewer';
import { type LinkedDocLoadData, useLinkedDoc } from './useLinkedDoc';

const hasDom = globalThis.document !== undefined;
const unsupportedSourceSave = disabledSourceSave('unsupported-extension');
const originalFetch = globalThis.fetch;

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
    renderAs: 'markdown' | 'html';
    rawHtml: string;
    shareHtml: string;
    annotations: Annotation[];
    selectedAnnotationId: string | null;
    loadedDocuments: LinkedDocLoadData[];
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

  const loadedDocuments: LinkedDocLoadData[] = [];
  let latest: Session['current'] extends () => infer T ? T : never;
  function Harness() {
    const [markdown, setMarkdown] = useState('root markdown');
    const [renderAs, setRenderAs] = useState<'markdown' | 'html'>('markdown');
    const [rawHtml, setRawHtml] = useState('');
    const [shareHtml, setShareHtml] = useState('');
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
      renderAs,
      rawHtml,
      shareHtml,
      setRenderAs,
      setRawHtml,
      setShareHtml,
      viewerRef,
      sidebar: { open: () => undefined },
      onDocumentLoaded: (doc) => {
        loadedDocuments.push(doc);
        return undefined;
      },
    });
    latest = {
      hook,
      markdown,
      renderAs,
      rawHtml,
      shareHtml,
      annotations,
      selectedAnnotationId,
      loadedDocuments,
      setAnnotations,
      setSelectedAnnotationId,
    };
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
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: originalFetch });
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  for (const container of containers.splice(0)) container.remove();
});

function mockFetch(response: Response | Error): void {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: async () => {
      if (response instanceof Error) throw response;
      return response;
    },
  });
}

type LinkedMarkdownResponseOverrides = {
  filepath?: unknown;
  markdown?: unknown;
  rawHtml?: unknown;
  shareHtml?: unknown;
  renderAs?: unknown;
  isConverted?: unknown;
  sourceSave?: unknown;
};

const linkedMarkdownResponse = (overrides: LinkedMarkdownResponseOverrides = {}): Response => Response.json({
  filepath: '/repo/docs/guide.md',
  markdown: 'linked markdown',
  renderAs: 'markdown',
  ...overrides,
});

describe('useLinkedDoc /api/doc response validation', () => {
  test.skipIf(!hasDom)('opens valid markdown and passes source-save data to the host', async () => {
    const session = await mountLinkedDoc();
    const sourceSave = {
      enabled: true,
      kind: 'local-text-file',
      scope: 'single-file',
      path: '/repo/docs/guide.md',
      basename: 'guide.md',
      language: 'markdown',
      hash: 'sha256:guide',
      mtimeMs: 1000,
      size: 16,
      eol: 'lf',
    } as const;
    mockFetch(linkedMarkdownResponse({ sourceSave }));

    await act(async () => {
      await session.current().hook.open('/repo/docs/guide.md');
    });

    expect(session.current().markdown).toBe('linked markdown');
    expect(session.current().loadedDocuments).toEqual([{
      filepath: '/repo/docs/guide.md',
      markdown: 'linked markdown',
      renderAs: 'markdown',
      sourceSave,
    }]);
    expect(session.current().hook.error).toBeNull();

    await session.unmount();
  });

  test.skipIf(!hasDom)('opens valid HTML with raw and share HTML', async () => {
    const session = await mountLinkedDoc();
    mockFetch(Response.json({
      filepath: '/repo/docs/guide.html',
      rawHtml: '<h1>Guide</h1>',
      shareHtml: '<article><h1>Guide</h1></article>',
      renderAs: 'html',
      isConverted: false,
    }));

    await act(async () => {
      await session.current().hook.open('/repo/docs/guide.html');
    });

    expect(session.current().renderAs).toBe('html');
    expect(session.current().rawHtml).toBe('<h1>Guide</h1>');
    expect(session.current().shareHtml).toBe('<article><h1>Guide</h1></article>');
    expect(session.current().markdown).toBe('');
    expect(session.current().loadedDocuments).toEqual([]);

    await session.unmount();
  });

  test.skipIf(!hasDom)('uses the load fallback for malformed success responses', async () => {
    const session = await mountLinkedDoc();

    mockFetch(Response.json({ filepath: 42, markdown: 'malformed filepath' }));
    await act(async () => {
      await session.current().hook.open('/repo/docs/guide.md');
    });
    expect(session.current().hook.error).toBe('Failed to load document');
    expect(session.current().markdown).toBe('root markdown');

    expect(session.current().loadedDocuments).toEqual([]);
    await session.unmount();
  });

  test.skipIf(!hasDom)('drops malformed optional fields while retaining valid fields', async () => {
    const session = await mountLinkedDoc();
    mockFetch(linkedMarkdownResponse({
      rawHtml: 42,
      shareHtml: 'valid share HTML',
      renderAs: 'invalid',
      isConverted: 'false',
      sourceSave: { enabled: true, path: 42 },
    }));

    await act(async () => {
      await session.current().hook.open('/repo/docs/guide.md');
    });

    expect(session.current().markdown).toBe('linked markdown');
    expect(session.current().renderAs).toBe('markdown');
    expect(session.current().rawHtml).toBe('');
    expect(session.current().shareHtml).toBe('');
    expect(session.current().loadedDocuments).toEqual([{
      filepath: '/repo/docs/guide.md',
      markdown: 'linked markdown',
      shareHtml: 'valid share HTML',
    }]);

    await session.unmount();
  });

  test.skipIf(!hasDom)('uses string error envelopes and the load fallback', async () => {
    const session = await mountLinkedDoc();

    mockFetch(Response.json({ error: 'File not found' }));
    await act(async () => {
      await session.current().hook.open('/repo/docs/missing.md');
    });
    expect(session.current().hook.error).toBe('File not found');

    mockFetch(Response.json({ error: 'Forbidden' }, { status: 403 }));
    await act(async () => {
      await session.current().hook.open('/repo/docs/forbidden.md');
    });
    expect(session.current().hook.error).toBe('Forbidden');

    for (const response of [
      Response.json({ error: 42 }, { status: 404 }),
      Response.json({}, { status: 404 }),
    ]) {
      mockFetch(response);
      await act(async () => {
        await session.current().hook.open('/repo/docs/malformed-error.md');
      });
      expect(session.current().hook.error).toBe('Failed to load document');
    }

    await session.unmount();
  });

  test.skipIf(!hasDom)('uses the connection fallback for invalid JSON and network errors', async () => {
    const session = await mountLinkedDoc();

    mockFetch(new Response('{', { headers: { 'Content-Type': 'application/json' } }));
    await act(async () => {
      await session.current().hook.open('/repo/docs/invalid-json.md');
    });
    expect(session.current().hook.error).toBe('Failed to connect to server');

    mockFetch(new Error('network failure'));
    await act(async () => {
      await session.current().hook.open('/repo/docs/network.md');
    });
    expect(session.current().hook.error).toBe('Failed to connect to server');

    await session.unmount();
  });
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
