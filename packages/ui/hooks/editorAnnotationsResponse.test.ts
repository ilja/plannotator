import { describe, expect, test } from 'bun:test';
import {
  decodeEditorAnnotationsResponse,
  loadEditorAnnotationsResponse,
} from './editorAnnotationsResponse';

const annotation = {
  id: 'annotation-1',
  filePath: 'src/example.ts',
  selectedText: 'const value = 1;',
  lineStart: 3,
  lineEnd: 3,
  comment: 'Consider naming this constant.',
  createdAt: 1_700_000_000_000,
};

describe('decodeEditorAnnotationsResponse', () => {
  test('decodes valid annotations and preserves order and compatible values', () => {
    expect(decodeEditorAnnotationsResponse({ annotations: [
      annotation,
      { ...annotation, id: 'annotation-2', comment: '', lineStart: 0, lineEnd: -1, createdAt: 1.5 },
      { ...annotation, id: 'annotation-2', filePath: '', selectedText: '', comment: undefined },
    ] })).toEqual([
      annotation,
      { ...annotation, id: 'annotation-2', comment: '', lineStart: 0, lineEnd: -1, createdAt: 1.5 },
      {
        id: 'annotation-2',
        filePath: '',
        selectedText: '',
        lineStart: 3,
        lineEnd: 3,
        createdAt: 1_700_000_000_000,
      },
    ]);
  });

  test('filters malformed entries and malformed optional comments independently', () => {
    expect(decodeEditorAnnotationsResponse({ annotations: [
      annotation,
      { ...annotation, id: 'without-comment', comment: 42 },
      { ...annotation, id: 42 },
      { ...annotation, id: 'after-invalid', selectedText: '' },
    ] })).toEqual([
      annotation,
      { ...annotation, id: 'without-comment', comment: undefined },
      { ...annotation, id: 'after-invalid', selectedText: '' },
    ]);
  });

  test('returns undefined for malformed envelopes and preserves valid empty arrays', () => {
    expect(decodeEditorAnnotationsResponse({ annotations: [] })).toEqual([]);
    expect(decodeEditorAnnotationsResponse({})).toBeUndefined();
    expect(decodeEditorAnnotationsResponse({ annotations: {} })).toBeUndefined();
    expect(decodeEditorAnnotationsResponse(null)).toBeUndefined();
  });
});

describe('loadEditorAnnotationsResponse', () => {
  test('loads valid responses and returns undefined for non-OK or invalid JSON', async () => {
    expect(await loadEditorAnnotationsResponse(new Response(JSON.stringify({ annotations: [] })))).toEqual([]);
    expect(await loadEditorAnnotationsResponse(new Response(JSON.stringify({ annotations: [] }), { status: 503 }))).toBeUndefined();
    expect(await loadEditorAnnotationsResponse(new Response('{invalid-json'))).toBeUndefined();
    expect(await loadEditorAnnotationsResponse(new Response(JSON.stringify({ annotations: {} })))).toBeUndefined();
  });
});
