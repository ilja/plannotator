import { afterEach, describe, expect, test } from 'bun:test';
import { createSourceDocumentWatch, type SourceDocumentWatchEventSource } from './sourceDocumentWatch';

type FakeSource = SourceDocumentWatchEventSource & {
  emit: (payload: object) => void;
  fail: () => void;
};

const sources: FakeSource[] = [];

function createFakeSource(): FakeSource {
  const source: FakeSource = {
    onmessage: null,
    onerror: null,
    close: () => undefined,
    emit(payload) {
      source.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
    },
    fail() {
      source.onerror?.();
    },
  };
  sources.push(source);
  return source;
}

function wait(milliseconds = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

afterEach(() => {
  sources.splice(0);
});

describe('createSourceDocumentWatch', () => {
  test('filters directories and debounces lifecycle reconciliation commands', async () => {
    const reconciled: Array<string | undefined> = [];
    const stop = createSourceDocumentWatch({
      directories: ['/repo/docs'],
      debounceMs: 5,
      eventSourceFactory: () => createFakeSource(),
      onReconcile: (changedDir) => reconciled.push(changedDir),
    });

    const source = sources[0];
    if (!source) throw new Error('expected a source');
    source.emit({ type: 'changed', dirPath: '/repo/other' });
    source.emit({ type: 'changed', dirPath: '/repo/docs' });
    source.emit({ type: 'changed', dirPath: '/repo/docs' });
    await wait();

    expect(reconciled).toEqual(['/repo/docs']);
    stop();
  });

  test('reconciles ready events and cleans up pending work and transport', async () => {
    const reconciled: Array<string | undefined> = [];
    const stop = createSourceDocumentWatch({
      directories: ['/repo/docs'],
      debounceMs: 20,
      eventSourceFactory: () => createFakeSource(),
      onReconcile: (changedDir) => reconciled.push(changedDir),
    });

    const source = sources[0];
    if (!source) throw new Error('expected a source');
    let closed = false;
    source.close = () => { closed = true; };
    source.emit({ type: 'ready', dirPath: '/repo/docs' });
    stop();
    await wait(30);

    expect(reconciled).toEqual([]);
    expect(closed).toBe(true);
  });

  test('reconnects after a transport error and stops reconnecting after cleanup', async () => {
    const stop = createSourceDocumentWatch({
      directories: ['/repo/docs'],
      reconnectDelayMs: 0,
      eventSourceFactory: () => createFakeSource(),
      onReconcile: () => undefined,
    });

    const first = sources[0];
    if (!first) throw new Error('expected the first source');
    first.fail();
    await wait(10);
    expect(sources).toHaveLength(2);

    stop();
    sources[1]?.fail();
    await wait(10);
    expect(sources).toHaveLength(2);
  });
});
