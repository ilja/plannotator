import { afterEach, describe, expect, test } from 'bun:test';
import {
  fetchSourceDocumentSnapshot,
  probeSourceSave,
  saveSourceDocument,
} from './sourceDocumentClient';

const originalFetch = globalThis.fetch;

function mockFetch(response: Response | Error) {
  globalThis.fetch = (async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('source document client', () => {
  test('probes source-save metadata from /api/doc', async () => {
    mockFetch(Response.json({
      sourceSave: {
        enabled: true,
        kind: 'local-text-file',
        scope: 'folder-file',
        path: '/repo/docs/a.md',
        basename: 'a.md',
        language: 'markdown',
        hash: 'sha256:after',
        mtimeMs: 1000,
        size: 6,
        eol: 'lf',
      },
    }));

    expect(await probeSourceSave('/repo/docs/a.md')).toEqual({
      status: 'ok',
      sourceSave: {
        enabled: true,
        kind: 'local-text-file',
        scope: 'folder-file',
        path: '/repo/docs/a.md',
        basename: 'a.md',
        language: 'markdown',
        hash: 'sha256:after',
        mtimeMs: 1000,
        size: 6,
        eol: 'lf',
      },
    });
  });

  test('distinguishes missing and unavailable source probes', async () => {
    mockFetch(new Response('missing', { status: 404 }));
    expect(await probeSourceSave('/repo/docs/missing.md')).toEqual({ status: 'missing' });

    mockFetch(new Error('network'));
    expect(await probeSourceSave('/repo/docs/a.md')).toEqual({ status: 'unavailable' });
  });

  test('fetches markdown source snapshots and rejects html documents', async () => {
    mockFetch(Response.json({
      markdown: 'after\n',
      sourceSave: {
        enabled: true,
        kind: 'local-text-file',
        scope: 'folder-file',
        path: '/repo/docs/a.md',
        basename: 'a.md',
        language: 'markdown',
        hash: 'sha256:after',
        mtimeMs: 1000,
        size: 6,
        eol: 'lf',
      },
    }));
    expect(await fetchSourceDocumentSnapshot('/repo/docs/a.md')).toEqual({
      status: 'ok',
      snapshot: {
        markdown: 'after\n',
        sourceSave: {
          enabled: true,
          kind: 'local-text-file',
          scope: 'folder-file',
          path: '/repo/docs/a.md',
          basename: 'a.md',
          language: 'markdown',
          hash: 'sha256:after',
          mtimeMs: 1000,
          size: 6,
          eol: 'lf',
        },
      },
    });

    mockFetch(Response.json({ markdown: '<p>after</p>', renderAs: 'html' }));
    expect(await fetchSourceDocumentSnapshot('/repo/docs/a.html')).toEqual({ status: 'unavailable' });
  });

  test('distinguishes missing and unavailable source snapshots', async () => {
    mockFetch(new Response('missing', { status: 404 }));
    expect(await fetchSourceDocumentSnapshot('/repo/docs/missing.md')).toEqual({ status: 'missing' });

    mockFetch(new Error('network'));
    expect(await fetchSourceDocumentSnapshot('/repo/docs/a.md')).toEqual({ status: 'unavailable' });
  });

  test('sends the source-save request and maps a successful response', async () => {
    let request: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      request = init;
      return Response.json({
        ok: true,
        hash: 'sha256:saved',
        mtimeMs: 2000,
        size: 6,
        eol: 'lf',
      });
    }) as typeof fetch;

    await expect(saveSourceDocument({
      path: '/repo/docs/a.md',
      text: 'saved\n',
      baseHash: 'sha256:before',
      baseMtimeMs: 1000,
      baseEol: 'lf',
      allowMissingBase: true,
    })).resolves.toEqual({
      status: 'saved',
      sourceSave: {
        hash: 'sha256:saved',
        mtimeMs: 2000,
        size: 6,
        eol: 'lf',
      },
    });
    expect(request?.method).toBe('POST');
    expect(request?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(request?.body))).toEqual({
      path: '/repo/docs/a.md',
      text: 'saved\n',
      baseHash: 'sha256:before',
      baseMtimeMs: 1000,
      baseEol: 'lf',
      allowMissingBase: true,
    });

    mockFetch(Response.json({
      ok: true,
      hash: 'sha256:unexpected',
      mtimeMs: 2000,
      size: 6,
      eol: 'lf',
    }, { status: 500 }));
    await expect(saveSourceDocument({ text: 'saved\n', baseHash: 'sha256:before' })).resolves.toEqual({
      status: 'error',
      code: 'invalid-response',
      message: 'Save failed',
    });
  });

  test('maps complete and incomplete save conflicts without a second read', async () => {
    mockFetch(Response.json({
      ok: false,
      code: 'conflict',
      message: 'changed',
      currentText: 'disk\n',
      currentHash: 'sha256:disk',
      currentMtimeMs: 3000,
      currentSize: 5,
      currentEol: 'lf',
    }, { status: 409 }));
    await expect(saveSourceDocument({ text: 'local\n', baseHash: 'sha256:before' })).resolves.toEqual({
      status: 'conflict',
      message: 'changed',
      snapshot: {
        text: 'disk\n',
        hash: 'sha256:disk',
        mtimeMs: 3000,
        size: 5,
        eol: 'lf',
      },
    });

    mockFetch(Response.json({ ok: false, code: 'conflict', message: 'changed' }, { status: 409 }));
    await expect(saveSourceDocument({ text: 'local\n', baseHash: 'sha256:before' })).resolves.toEqual({
      status: 'conflict-incomplete',
      message: 'changed',
    });
  });

  test('maps write failures to a typed client result', async () => {
    mockFetch(Response.json({ ok: false, code: 'write-failed', message: 'read-only' }, { status: 500 }));

    await expect(saveSourceDocument({ text: 'local\n', baseHash: 'sha256:before' })).resolves.toEqual({
      status: 'error',
      code: 'write-failed',
      message: 'read-only',
    });

    mockFetch(new Error('network'));
    await expect(saveSourceDocument({ text: 'local\n', baseHash: 'sha256:before' })).resolves.toEqual({
      status: 'error',
      code: 'unavailable',
      message: 'Save failed',
    });
  });
});
