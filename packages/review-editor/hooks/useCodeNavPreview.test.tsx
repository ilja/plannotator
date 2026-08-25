import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useCodeNavPreview } from './useCodeNavPreview';

const hasDom = globalThis.document !== undefined;
const realFetch = globalThis.fetch;
const roots: Root[] = [];

function installFetch(
  responses: Response[],
  requests: RequestInfo[] = [],
  fetchErrors: Array<Error | undefined> = [],
): void {
  let index = 0;
  globalThis.fetch = Object.assign(
    async (input: RequestInfo): Promise<Response> => {
      requests.push(input);
      const responseIndex = index++;
      const error = fetchErrors[responseIndex];
      if (error) return Promise.reject(error);
      return responses[responseIndex] ?? new Response(null, { status: 500 });
    },
    { preconnect: (): void => {} },
  );
}

function HookHarness(): React.JSX.Element {
  const { previewData, isLoading, selectLocation } = useCodeNavPreview();

  return (
    <div>
      <button type="button" data-path="src/example.ts" onClick={() => void selectLocation('src/example.ts', 2)}>
        Select example
      </button>
      <button type="button" data-path="src/other.ts" onClick={() => void selectLocation('src/other.ts', 2)}>
        Select other
      </button>
      <button type="button" data-path="src/third.ts" onClick={() => void selectLocation('src/third.ts', 2)}>
        Select third
      </button>
      <output
        data-loading={String(isLoading)}
        data-file-path={previewData?.filePath ?? ''}
        data-lines={previewData?.lines.join('|') ?? ''}
      />
    </div>
  );
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mountHarness(): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(<HookHarness />);
    await flushAsyncWork();
  });

  return host;
}

async function selectLocation(host: HTMLDivElement, filePath: string): Promise<HTMLOutputElement> {
  const button = host.querySelector(`button[data-path="${filePath}"]`);
  const output = host.querySelector('output');
  if (!(button instanceof HTMLButtonElement) || !(output instanceof HTMLOutputElement)) {
    throw new Error('Hook harness did not render');
  }

  await act(async () => {
    button.click();
    await flushAsyncWork();
  });

  return output;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  globalThis.fetch = realFetch;
  if (hasDom) document.body.innerHTML = '';
});

describe('useCodeNavPreview response handling', () => {
  test.skipIf(!hasDom)('renders valid content as a preview', async () => {
    const requests: RequestInfo[] = [];
    installFetch([new Response(JSON.stringify({ content: 'first line\nsecond line' }))], requests);
    const host = await mountHarness();

    const output = await selectLocation(host, 'src/example.ts');

    expect(output.dataset.loading).toBe('false');
    expect(output.dataset.filePath).toBe('src/example.ts');
    expect(output.dataset.lines).toBe('first line|second line');
    expect(requests).toHaveLength(1);
  });

  test.skipIf(!hasDom)('clears the preview after malformed roots and content', async () => {
    installFetch([
      new Response(JSON.stringify({ content: 'trusted content' })),
      new Response(JSON.stringify([])),
      new Response(JSON.stringify({ content: 42 })),
    ]);
    const host = await mountHarness();

    await selectLocation(host, 'src/example.ts');
    const malformedRoot = await selectLocation(host, 'src/other.ts');
    expect(malformedRoot.dataset.filePath).toBe('');
    expect(malformedRoot.dataset.lines).toBe('');

    const malformedContent = await selectLocation(host, 'src/third.ts');
    expect(malformedContent.dataset.loading).toBe('false');
    expect(malformedContent.dataset.filePath).toBe('');
    expect(malformedContent.dataset.lines).toBe('');
  });

  test.skipIf(!hasDom)('clears the preview after invalid JSON', async () => {
    installFetch([
      new Response(JSON.stringify({ content: 'trusted content' })),
      new Response('{invalid-json'),
    ]);
    const host = await mountHarness();

    await selectLocation(host, 'src/example.ts');
    const output = await selectLocation(host, 'src/other.ts');

    expect(output.dataset.loading).toBe('false');
    expect(output.dataset.filePath).toBe('');
    expect(output.dataset.lines).toBe('');
  });

  test.skipIf(!hasDom)('clears the preview after a non-OK response', async () => {
    installFetch([
      new Response(JSON.stringify({ content: 'trusted content' })),
      new Response(JSON.stringify({ content: 'untrusted content' }), { status: 503 }),
    ]);
    const host = await mountHarness();

    await selectLocation(host, 'src/example.ts');
    const output = await selectLocation(host, 'src/other.ts');

    expect(output.dataset.loading).toBe('false');
    expect(output.dataset.filePath).toBe('');
    expect(output.dataset.lines).toBe('');
  });

  test.skipIf(!hasDom)('clears the preview after a fetch error', async () => {
    installFetch([
      new Response(JSON.stringify({ content: 'trusted content' })),
    ], [], [undefined, new Error('connection failed')]);
    const host = await mountHarness();

    await selectLocation(host, 'src/example.ts');
    const output = await selectLocation(host, 'src/other.ts');

    expect(output.dataset.loading).toBe('false');
    expect(output.dataset.filePath).toBe('');
    expect(output.dataset.lines).toBe('');
  });

  test.skipIf(!hasDom)('does not cache malformed content before a valid retry', async () => {
    const requests: RequestInfo[] = [];
    installFetch([
      new Response(JSON.stringify({ content: 42 })),
      new Response(JSON.stringify({ content: 'valid after retry' })),
    ], requests);
    const host = await mountHarness();

    const failed = await selectLocation(host, 'src/example.ts');
    expect(failed.dataset.filePath).toBe('');

    const retried = await selectLocation(host, 'src/example.ts');
    expect(retried.dataset.loading).toBe('false');
    expect(retried.dataset.filePath).toBe('src/example.ts');
    expect(retried.dataset.lines).toBe('valid after retry');
    expect(requests).toHaveLength(2);
  });
});
