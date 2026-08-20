import { afterEach, describe, expect, test } from 'bun:test';
import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useExternalAnnotations } from './useExternalAnnotations';
import { AnnotationType, type Annotation } from '../types';

const hasDom = globalThis.document !== undefined;
const realFetch = globalThis.fetch;
const realEventSource = globalThis.EventSource;

class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState = 0;
  withCredentials = false;

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  // SAFETY: data is untrusted external event — any is intentional
  emit(data: any): void {
    // SAFETY: constructing MessageEvent from trusted JSON — cast to MessageEvent
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  close(): void {}
}

type ExternalAnnotations = ReturnType<typeof useExternalAnnotations<Annotation>>;

let roots: Root[] = [];
let containers: HTMLElement[] = [];

async function mountExternalAnnotations(): Promise<{
  current: () => ExternalAnnotations;
  unmount: () => Promise<void>;
}> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);
  let latest!: ExternalAnnotations;

  function Harness() {
    const resultRef = useRef<ExternalAnnotations | null>(null);
    resultRef.current = useExternalAnnotations<Annotation>({ enabled: true });
    latest = resultRef.current;
    return null;
  }

  await act(async () => root.render(<Harness />));
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

afterEach(async () => {
  globalThis.fetch = realFetch;
  if (realEventSource) globalThis.EventSource = realEventSource;
  else {
    // SAFETY: globalThis is untyped in test — any is intentional
    delete (globalThis as any).EventSource;
  }
  MockEventSource.instances = [];
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const container of containers.splice(0)) container.remove();
});

describe('useExternalAnnotations', () => {
  test.skipIf(!hasDom)('deletes an external choice when the UI clears or replaces it', async () => {
    MockEventSource.instances = [];
    // SAFETY: MockEventSource matches EventSource shape — cast to typeof EventSource
    // @ts-expect-error — MockEventSource is incomplete, intentionally suppressed
    globalThis.EventSource = MockEventSource as typeof EventSource;
    const calls: Array<{ url: string; method: string }> = [];
    // SAFETY: fetch shim matches global fetch shape — cast to typeof fetch
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const session = await mountExternalAnnotations();
    const choice: Annotation = {
      id: 'ann-choice-external',
      blockId: 'block-0',
      startOffset: 0,
      endOffset: 4,
      type: AnnotationType.COMMENT,
      originalText: 'Beta',
      createdA: 1,
      source: 'agent',
      choiceOptionLabel: 'B',
      choiceValidationEvidence: {
        question: 'Pick one',
        options: [
          { label: 'A', text: 'Alpha' },
          { label: 'B', text: 'Beta' },
        ],
      },
    };
    await act(async () => {
      MockEventSource.instances[0]!.emit({ type: 'snapshot', annotations: [choice] });
      await Promise.resolve();
    });
    expect(session.current().externalAnnotations).toEqual([choice]);

    await act(async () => session.current().deleteExternalAnnotation(choice.id));

    expect(session.current().externalAnnotations).toEqual([]);
    expect(calls).toEqual([{
      url: '/api/external-annotations?id=ann-choice-external',
      method: 'DELETE',
    }]);

    await session.unmount();
  });
});
