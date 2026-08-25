import { describe, expect, test } from 'bun:test';

import { AnnotationType } from '../types';
import {
  compress,
  createShortShareUrl,
  decodeLegacyShareData,
  decodeSharePayload,
  decompress,
  fromShareable,
  loadFromPasteId,
} from './sharing';

const validPayload = () => ({
  p: '# Plan',
  a: [['C', 'selected text', 'comment', null, null]],
  d: ['added'],
  s: [null],
  cv: [{
    question: 'Which approach?',
    options: [
      { label: 'A', text: 'First' },
      { label: 'B', text: 'Second' },
    ],
  }],
  co: ['B'],
});

describe('paste service URL validation', () => {
  test('rejects malformed and non-HTTP(S) targets without calling fetch', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    // SAFETY: fetch shim matches the global fetch shape for this test.
    // @ts-expect-error — fetch shim intentionally omits the preconnect property.
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response('{}');
    }) as typeof fetch;

    try {
      for (const pasteApiUrl of ['not-a-url', 'file:///tmp/paste', 'data:text/plain,paste', 'javascript:alert(1)']) {
        expect(await createShortShareUrl('# Plan', [], undefined, { pasteApiUrl })).toBeNull();
        expect(await loadFromPasteId('paste-id', pasteApiUrl)).toBeNull();
      }
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('calls a custom HTTP paste backend with its original URL', async () => {
    const originalFetch = globalThis.fetch;
    const fetchUrls: string[] = [];
    // SAFETY: fetch shim matches the global fetch shape for this test.
    globalThis.fetch = (async (input) => {
      fetchUrls.push(String(input));
      return new Response(JSON.stringify({ id: 'paste-id' }), { status: 200 });
    }) as typeof fetch;

    try {
      await expect(createShortShareUrl(
        '# Plan',
        [],
        undefined,
        { pasteApiUrl: 'http://paste.test/custom', shareBaseUrl: 'http://share.test' },
      )).resolves.toMatchObject({ id: 'paste-id' });
      expect(fetchUrls).toEqual(['http://paste.test/custom/api/paste']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('decodeSharePayload', () => {
  test('decodes a complete JSON-normalized payload', () => {
    const payload = decodeSharePayload(validPayload());

    expect(payload?.p).toBe('# Plan');
    expect(payload?.d).toEqual(['added']);
    expect(payload?.s).toEqual([null]);
    expect(payload?.cv?.[0]?.options).toHaveLength(2);
  });

  test('accepts source gaps normalized to null during JSON compression', async () => {
    const compressed = await compress({
      ...validPayload(),
      s: ['eslint', undefined],
    });
    const payload = decodeSharePayload(await decompress(compressed));

    expect(payload?.s).toEqual(['eslint', null]);
  });

  test('rejects malformed choice validation evidence', () => {
    const input = {
      ...validPayload(),
      cv: [{ question: 'Which approach?' }],
    };

    expect(decodeSharePayload(input)).toBeNull();
  });

  test('rejects choice validation evidence with duplicate labels', () => {
    const input = validPayload();
    input.cv[0].options[1].label = 'A';

    expect(decodeSharePayload(input)).toBeNull();
  });

  test('rejects invalid diff contexts', () => {
    const input = validPayload();
    input.d = ['staged'];

    expect(decodeSharePayload(input)).toBeNull();
  });

  test('migrates historical replacement and insertion tuples to comments', () => {
    const payload = decodeSharePayload({
      p: '# Historical',
      a: [
        ['R', 'before', 'after', null],
        ['I', 'context', 'inserted', null],
      ],
    });
    const annotations = fromShareable(payload?.a ?? []);

    expect(annotations.map(annotation => annotation.type)).toEqual([
      AnnotationType.COMMENT,
      AnnotationType.COMMENT,
    ]);
    expect(annotations.map(annotation => annotation.text)).toEqual(['after', 'inserted']);
  });
});

describe('decodeLegacyShareData', () => {
  test('decodes tuple drafts before restoration', () => {
    const draft = decodeLegacyShareData({
      a: [['C', 'selected text', 'comment', null]],
      g: [['image.png', 'Screenshot']],
      d: ['modified'],
      ts: 1,
    });

    expect(draft?.a).toHaveLength(1);
    expect(draft?.g).toEqual([['image.png', 'Screenshot']]);
  });

  test('rejects malformed annotation tuples', () => {
    expect(decodeLegacyShareData({ a: [['C']], ts: 1 })).toBeNull();
  });
});
