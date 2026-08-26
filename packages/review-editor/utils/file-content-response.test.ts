import { describe, expect, test } from 'bun:test';
import {
  decodeFileContentResponse,
  loadFileContentResponse,
} from './file-content-response';

const validResponses = [
  { oldContent: 'before', newContent: 'after' },
  { oldContent: 'before', newContent: null },
  { oldContent: null, newContent: 'after' },
  { oldContent: null, newContent: null },
] as const;

describe('decodeFileContentResponse', () => {
  test('decodes every valid nullable content combination', () => {
    for (const response of validResponses) {
      expect(decodeFileContentResponse(response)).toEqual(response);
    }
  });

  test('rejects malformed envelopes and fields', () => {
    for (const value of [
      null,
      [],
      'file content',
      {},
      { oldContent: 'before' },
      { newContent: 'after' },
      { oldContent: 42, newContent: 'after' },
      { oldContent: 'before', newContent: false },
      { oldContent: undefined, newContent: 'after' },
    ]) {
      expect(decodeFileContentResponse(value)).toBeNull();
    }
  });
});

describe('loadFileContentResponse', () => {
  test('loads and decodes a valid response', async () => {
    await expect(
      loadFileContentResponse(new Response(JSON.stringify(validResponses[0]), { status: 200 })),
    ).resolves.toEqual(validResponses[0]);
  });

  test('returns null for non-OK responses', async () => {
    await expect(
      loadFileContentResponse(new Response(JSON.stringify(validResponses[0]), { status: 503 })),
    ).resolves.toBeNull();
  });

  test('returns null when JSON parsing fails', async () => {
    await expect(
      loadFileContentResponse(new Response('{invalid-json', { status: 200 })),
    ).resolves.toBeNull();
  });

  test('returns null for malformed JSON envelopes', async () => {
    await expect(
      loadFileContentResponse(new Response(JSON.stringify({ oldContent: 'before' }), { status: 200 })),
    ).resolves.toBeNull();
  });

});
