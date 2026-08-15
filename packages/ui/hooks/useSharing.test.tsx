import { afterEach, describe, expect, test } from 'bun:test';
import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useSharing } from './useSharing';
import { createShortShareUrl } from '../utils/sharing';
import type { Annotation, ImageAttachment } from '../types';
import { AnnotationType } from '../types';

const hasDom = typeof document !== 'undefined';
const realFetch = globalThis.fetch;
const originalUrl = hasDom ? window.location.href : '';
const setHappyDomUrl = (url: string): void => {
  (window as typeof window & { happyDOM: { setURL: (value: string) => void } }).happyDOM.setURL(url);
};
const markdown = `Pick one

- Option A: Alpha
- Option B: Beta

Recommendation: Option B.`;

const choiceAnnotation = (withEvidence: boolean): Annotation => ({
  id: 'ann-choice-local',
  blockId: 'block-0',
  startOffset: 0,
  endOffset: 4,
  type: AnnotationType.COMMENT,
  originalText: 'Beta',
  text: '👍 Selected Option',
  createdA: 1,
  isQuickLabel: true,
  choiceOptionLabel: 'B',
  ...(withEvidence ? {
    choiceValidationEvidence: {
      question: 'Pick one',
      options: [
        { label: 'A', text: 'Alpha' },
        { label: 'B', text: 'Beta' },
      ],
    },
  } : {}),
});

type Sharing = ReturnType<typeof useSharing>;
type HarnessState = {
  markdown: string;
  annotations: Annotation[];
  sharing: Sharing;
};

let roots: Root[] = [];
let containers: HTMLElement[] = [];

async function mountSharing(): Promise<{
  current: () => HarnessState;
  unmount: () => Promise<void>;
}> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);
  let latest!: HarnessState;

  function Harness() {
    const [currentMarkdown, setMarkdown] = useState('');
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [globalAttachments, setGlobalAttachments] = useState<ImageAttachment[]>([]);
    const resultRef = useRef<Sharing | null>(null);
    resultRef.current = useSharing(
      currentMarkdown,
      annotations,
      globalAttachments,
      setMarkdown,
      setAnnotations,
      setGlobalAttachments,
    );
    latest = { markdown: currentMarkdown, annotations, sharing: resultRef.current };
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
      roots = roots.filter(entry => entry !== root);
      containers = containers.filter(entry => entry !== container);
    },
  };
}

async function createStoredShortShare(annotation: Annotation): Promise<{ url: string; ciphertext: string }> {
  let ciphertext = '';
  globalThis.fetch = (async (_input, init) => {
    ciphertext = (JSON.parse(String(init?.body)) as { data: string }).data;
    return new Response(JSON.stringify({ id: 'choice01' }), { status: 200 });
  }) as unknown as typeof fetch;
  const result = await createShortShareUrl(
    markdown,
    [annotation],
    [],
    { pasteApiUrl: 'https://paste.test', shareBaseUrl: 'http://localhost' },
  );
  return { url: result!.shortUrl, ciphertext };
}

afterEach(async () => {
  globalThis.fetch = realFetch;
  if (hasDom) setHappyDomUrl(originalUrl);
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const container of containers.splice(0)) container.remove();
});

describe('useSharing choice decisions', () => {
  test.skipIf(!hasDom)('restores choice identity and evidence from a short-link load', async () => {
    let stored = await createStoredShortShare(choiceAnnotation(true));
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: stored.ciphertext }), { status: 200 })) as unknown as typeof fetch;
    setHappyDomUrl(stored.url)
    expect(window.location.pathname).toBe('/p/choice01');

    const session = await mountSharing();
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));

    expect(session.current().sharing.isSharedSession).toBe(true);
    expect(session.current().markdown).toBe(markdown);
    expect(session.current().annotations[0]).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^ann-choice-/),
      choiceOptionLabel: 'B',
      choiceValidationEvidence: choiceAnnotation(true).choiceValidationEvidence,
    }));

    await session.unmount();
  });

  test.skipIf(!hasDom)('discards a legacy short-link choice without evidence', async () => {
    const stored = await createStoredShortShare(choiceAnnotation(false));
    globalThis.fetch = (async () => new Response(JSON.stringify({ data: stored.ciphertext }), { status: 200 })) as unknown as typeof fetch;
    setHappyDomUrl(stored.url);

    const session = await mountSharing();
    await act(async () => new Promise(resolve => setTimeout(resolve, 20)));

    expect(session.current().sharing.isSharedSession).toBe(true);
    expect(session.current().annotations).toEqual([]);

    await session.unmount();
  });
});
