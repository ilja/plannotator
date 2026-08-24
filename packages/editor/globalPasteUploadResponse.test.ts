import { describe, expect, test } from 'bun:test';
import { decodeGlobalPasteUploadResponse } from './globalPasteUploadResponse';

const createResponse = (
  body: Record<string, string | number>,
  ok = true,
  onJson = () => {},
): Pick<Response, 'ok' | 'json'> => ({
  ok,
  json: async () => {
    onJson();
    return body;
  },
});

describe('decodeGlobalPasteUploadResponse', () => {
  test('decodes a valid upload response into a global attachment', async () => {
    await expect(
      decodeGlobalPasteUploadResponse(
        createResponse({ path: '/uploads/image.png' }),
        'screenshot.png',
      ),
    ).resolves.toEqual({ path: '/uploads/image.png', name: 'screenshot.png' });
  });

  test('rejects a malformed upload envelope', async () => {
    await expect(
      decodeGlobalPasteUploadResponse(createResponse({ path: 42 }), 'screenshot.png'),
    ).rejects.toThrow();
  });

  test('rejects invalid JSON', async () => {
    const response: Pick<Response, 'ok' | 'json'> = {
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    };

    await expect(
      decodeGlobalPasteUploadResponse(response, 'screenshot.png'),
    ).rejects.toThrow('Unexpected end of JSON input');
  });

  test('accepts an empty path for compatibility', async () => {
    await expect(
      decodeGlobalPasteUploadResponse(createResponse({ path: '' }), 'screenshot.png'),
    ).resolves.toEqual({ path: '', name: 'screenshot.png' });
  });

  test('ignores non-OK responses without reading their JSON', async () => {
    let jsonCalls = 0;
    const response = createResponse(
      { path: '/uploads/image.png' },
      false,
      () => { jsonCalls += 1; },
    );

    await expect(
      decodeGlobalPasteUploadResponse(response, 'screenshot.png'),
    ).resolves.toBeUndefined();
    expect(jsonCalls).toBe(0);
  });
});
