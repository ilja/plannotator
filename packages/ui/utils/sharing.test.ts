import { describe, expect, test } from 'bun:test';

import { AnnotationType } from '../types';
import {
  compress,
  decodeLegacyShareData,
  decodeSharePayload,
  decompress,
  fromShareable,
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
