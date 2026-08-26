import { describe, expect, test } from 'bun:test';
import {
  decodePRActionResponse,
  readPRActionResponse,
} from './pr-action-response';

describe('decodePRActionResponse', () => {
  test('decodes successful responses with optional and empty URLs', () => {
    expect(decodePRActionResponse({ ok: true, prUrl: 'https://github.com/example/repo/pull/1' })).toEqual({
      ok: true,
      prUrl: 'https://github.com/example/repo/pull/1',
    });
    expect(decodePRActionResponse({ ok: true })).toEqual({ ok: true });
    expect(decodePRActionResponse({ ok: true, prUrl: '' })).toEqual({ ok: true, prUrl: '' });
  });

  test('rejects malformed successful responses', () => {
    for (const value of [
      null,
      [],
      {},
      { ok: false },
      { ok: 'true' },
      { ok: true, prUrl: 42 },
      { ok: true, prUrl: 42, error: 'Do not trust this' },
      { ok: true, prUrl: null },
    ]) {
      expect(decodePRActionResponse(value)).toBeUndefined();
    }
  });

  test('decodes only string error envelopes', () => {
    expect(decodePRActionResponse({ error: 'Authentication failed' })).toEqual({
      ok: false,
      error: 'Authentication failed',
    });
    expect(decodePRActionResponse({ ok: false, error: 'Target failed' })).toEqual({
      ok: false,
      error: 'Target failed',
    });
    expect(decodePRActionResponse({ error: '' })).toEqual({ ok: false, error: '' });
    expect(decodePRActionResponse({ error: 42 })).toBeUndefined();
    expect(decodePRActionResponse({ error: { message: 'Do not trust this' } })).toBeUndefined();
  });
});

describe('readPRActionResponse', () => {
  test('reads successful responses and preserves an empty URL', async () => {
    await expect(readPRActionResponse(new Response(JSON.stringify({
      ok: true,
      prUrl: 'https://github.com/example/repo/pull/1',
    })))).resolves.toEqual({
      ok: true,
      prUrl: 'https://github.com/example/repo/pull/1',
    });
    await expect(readPRActionResponse(new Response(JSON.stringify({ ok: true })))).resolves.toEqual({ ok: true });
    await expect(readPRActionResponse(new Response(JSON.stringify({ ok: true, prUrl: '' })))).resolves.toEqual({
      ok: true,
      prUrl: '',
    });
  });

  test('uses string errors for non-OK and 200 error envelopes', async () => {
    await expect(readPRActionResponse(new Response(JSON.stringify({ error: 'Authentication failed' }), { status: 500 }))).resolves.toEqual({
      ok: false,
      error: 'Authentication failed',
    });
    await expect(readPRActionResponse(new Response(JSON.stringify({ ok: false, error: 'Target failed' })))).resolves.toEqual({
      ok: false,
      error: 'Target failed',
    });
    await expect(readPRActionResponse(new Response(JSON.stringify({ error: 'Target failed' })))).resolves.toEqual({
      ok: false,
      error: 'Target failed',
    });
  });

  test('uses the fallback for malformed envelopes and invalid JSON', async () => {
    const fallback = 'Failed to submit';
    const malformedResponses = [
      new Response('{'),
      new Response(JSON.stringify({ ok: false, error: 42 })),
      new Response(JSON.stringify({ ok: true, prUrl: 42 })),
      new Response(JSON.stringify({ ok: true, prUrl: 42, error: 'Do not trust this' })),
      new Response(JSON.stringify({ ok: true, prUrl: 42 }), { status: 500 }),
      new Response(JSON.stringify({ ok: true }), { status: 500 }),
      new Response(JSON.stringify({ error: 42 }), { status: 500 }),
    ];

    for (const response of malformedResponses) {
      await expect(readPRActionResponse(response)).resolves.toEqual({ ok: false, error: fallback });
    }
  });

});
