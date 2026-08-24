import { afterEach, describe, expect, test } from 'bun:test';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PRStackCallbacks } from './usePRStack';
import {
  decodePRDiffScopeError,
  decodePRDiffScopeResponse,
  readPRDiffScopeResponse,
  usePRStack,
} from './usePRStack';

const hasDom = globalThis.document !== undefined;
const realFetch = globalThis.fetch;
const roots: Root[] = [];

const validLayerResponse = {
  rawPatch: 'diff --git a/file.ts b/file.ts',
  gitRef: 'main..HEAD',
  prDiffScope: 'layer' as const,
  prDiffScopeOptions: [
    { id: 'layer' as const, label: 'Layer', description: 'Layer changes', enabled: true },
    { id: 'full-stack' as const, label: 'Full stack', description: 'All changes', enabled: true },
    { id: 'layer', label: 'invalid', description: 'invalid', enabled: 'yes' },
  ],
  prPatchIncomplete: true,
  prPatchUpgradeAvailable: false,
  error: 'A non-fatal warning',
  semanticDiff: { available: true, semVersion: '1.0.0', semSource: 'local' },
  viewedFiles: ['file.ts', 42],
};

const validFullStackResponse = {
  rawPatch: 'full diff',
  gitRef: 'main..HEAD',
  prDiffScope: 'full-stack' as const,
};

function installFetch(responses: Response[]): void {
  let index = 0;
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => responses[index++] ?? responses[responses.length - 1],
    { preconnect: (): void => {} },
  );
}

function HookHarness({ applied, errors }: { applied: unknown[]; errors: string[] }): React.JSX.Element {
  const callbacksRef = useRef<PRStackCallbacks>({
    applyPRResponse: (data) => applied.push(data),
    onError: (message) => errors.push(message),
  });
  const {
    handleScopeSelect,
    handleLoadFullDiff,
    isSwitchingPRScope,
    isLoadingFullDiff,
  } = usePRStack(callbacksRef);

  return (
    <div>
      <button type="button" data-action="scope" onClick={() => void handleScopeSelect('full-stack')}>Scope</button>
      <button type="button" data-action="full" onClick={() => void handleLoadFullDiff()}>Full</button>
      <output
        data-switching={String(isSwitchingPRScope)}
        data-loading-full={String(isLoadingFullDiff)}
      />
    </div>
  );
}

async function renderHarness(applied: unknown[], errors: string[]): Promise<void> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(<HookHarness applied={applied} errors={errors} />);
    await Promise.resolve();
  });
}

async function clickAction(action: 'scope' | 'full'): Promise<HTMLOutputElement> {
  const button = document.querySelector(`[data-action="${action}"]`);
  const output = document.querySelector('output');
  if (!(button instanceof HTMLButtonElement) || !(output instanceof HTMLOutputElement)) {
    throw new Error('Hook harness did not render');
  }

  await act(async () => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
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

describe('decodePRDiffScopeResponse', () => {
  test('decodes both supported scopes', () => {
    expect(decodePRDiffScopeResponse(validLayerResponse)).toMatchObject({
      rawPatch: validLayerResponse.rawPatch,
      gitRef: validLayerResponse.gitRef,
      prDiffScope: 'layer',
    });
    expect(decodePRDiffScopeResponse(validFullStackResponse)).toEqual(validFullStackResponse);
  });

  test('rejects missing or malformed required fields', () => {
    for (const value of [
      null,
      [],
      {},
      { ...validLayerResponse, rawPatch: undefined },
      { ...validLayerResponse, rawPatch: 42 },
      { ...validLayerResponse, gitRef: undefined },
      { ...validLayerResponse, gitRef: null },
      { ...validLayerResponse, prDiffScope: undefined },
      { ...validLayerResponse, prDiffScope: 'unknown' },
      { ...validLayerResponse, prDiffScope: 42 },
    ]) {
      expect(decodePRDiffScopeResponse(value)).toBeUndefined();
    }
  });

  test('filters malformed optional array members and retains valid siblings', () => {
    const decoded = decodePRDiffScopeResponse(validLayerResponse);

    expect(decoded).toMatchObject({
      rawPatch: validLayerResponse.rawPatch,
      gitRef: validLayerResponse.gitRef,
      prDiffScope: validLayerResponse.prDiffScope,
      prDiffScopeOptions: validLayerResponse.prDiffScopeOptions.slice(0, 2),
      prPatchIncomplete: true,
      prPatchUpgradeAvailable: false,
      error: validLayerResponse.error,
      semanticDiff: validLayerResponse.semanticDiff,
      viewedFiles: ['file.ts'],
    });
  });
});

describe('decodePRDiffScopeError', () => {
  test('trusts only a string error field', () => {
    expect(decodePRDiffScopeError({ error: 'Permission denied' })).toBe('Permission denied');
    expect(decodePRDiffScopeError({ error: '' })).toBe('');
    expect(decodePRDiffScopeError({ error: { message: 'untrusted' } })).toBeUndefined();
    expect(decodePRDiffScopeError({ error: 42 })).toBeUndefined();
    expect(decodePRDiffScopeError(null)).toBeUndefined();
  });
});

describe('readPRDiffScopeResponse', () => {
  test('resolves valid successful responses', async () => {
    await expect(readPRDiffScopeResponse(
      new Response(JSON.stringify(validLayerResponse), { status: 200 }),
      'Failed to switch PR diff scope',
    )).resolves.toMatchObject({ prDiffScope: 'layer' });
  });

  test('rejects invalid JSON and malformed successful bodies', async () => {
    await expect(readPRDiffScopeResponse(
      new Response('{invalid-json', { status: 200 }),
      'Failed to switch PR diff scope',
    )).rejects.toThrow();
    await expect(readPRDiffScopeResponse(
      new Response(JSON.stringify({ rawPatch: 'patch', gitRef: 'ref' }), { status: 200 }),
      'Failed to switch PR diff scope',
    )).rejects.toThrow();
  });

  test('uses only a string error from non-OK responses', async () => {
    await expect(readPRDiffScopeResponse(
      new Response(JSON.stringify({ error: 'Permission denied' }), { status: 403 }),
      'Failed to switch PR diff scope',
    )).rejects.toThrow('Permission denied');
    await expect(readPRDiffScopeResponse(
      new Response(JSON.stringify({ error: { message: 'untrusted' } }), { status: 503 }),
      'Failed to switch PR diff scope',
    )).rejects.toThrow('Failed to switch PR diff scope');
    await expect(readPRDiffScopeResponse(
      new Response('{invalid-json', { status: 502 }),
      'Failed to load the full diff',
    )).rejects.toThrow('Failed to load the full diff');
  });
});

describe('usePRStack response handling', () => {
  test.skipIf(!hasDom)('validates scope select and full-diff responses while preserving loading completion', async () => {
    const applied: unknown[] = [];
    const errors: string[] = [];
    installFetch([
      new Response(JSON.stringify(validFullStackResponse), { status: 200 }),
      new Response(JSON.stringify(validLayerResponse), { status: 200 }),
    ]);
    await renderHarness(applied, errors);

    const scopeOutput = await clickAction('scope');
    expect(scopeOutput.dataset.switching).toBe('false');
    expect(applied[0]).toEqual(validFullStackResponse);

    const fullOutput = await clickAction('full');
    expect(fullOutput.dataset.loadingFull).toBe('false');
    expect(applied[1]).toMatchObject({ prDiffScope: 'layer', rawPatch: validLayerResponse.rawPatch });
    expect(errors).toEqual([]);
  });

  test.skipIf(!hasDom)('routes malformed successful responses and invalid JSON to onError', async () => {
    const applied: unknown[] = [];
    const errors: string[] = [];
    installFetch([
      new Response(JSON.stringify({ rawPatch: 'patch', gitRef: 'ref', prDiffScope: 'bad' }), { status: 200 }),
      new Response('{invalid-json', { status: 200 }),
    ]);
    await renderHarness(applied, errors);

    const firstOutput = await clickAction('scope');
    expect(firstOutput.dataset.switching).toBe('false');
    expect(errors).toHaveLength(1);

    const secondOutput = await clickAction('scope');
    expect(secondOutput.dataset.switching).toBe('false');
    expect(errors).toHaveLength(2);
    expect(applied).toEqual([]);
  });

  test.skipIf(!hasDom)('uses trusted and fallback messages for non-OK error envelopes', async () => {
    const applied: unknown[] = [];
    const errors: string[] = [];
    installFetch([
      new Response(JSON.stringify({ error: 'Permission denied' }), { status: 403 }),
      new Response(JSON.stringify({ error: { message: 'untrusted' } }), { status: 503 }),
      new Response('{invalid-json', { status: 502 }),
    ]);
    await renderHarness(applied, errors);

    const trustedOutput = await clickAction('scope');
    expect(trustedOutput.dataset.switching).toBe('false');
    expect(errors).toEqual(['Permission denied']);

    const malformedOutput = await clickAction('scope');
    expect(malformedOutput.dataset.switching).toBe('false');
    expect(errors).toEqual(['Permission denied', 'Failed to switch PR diff scope']);

    const invalidJsonOutput = await clickAction('full');
    expect(invalidJsonOutput.dataset.loadingFull).toBe('false');
    expect(errors).toEqual([
      'Permission denied',
      'Failed to switch PR diff scope',
      'Failed to load the full diff',
    ]);
    expect(applied).toEqual([]);
  });
});
