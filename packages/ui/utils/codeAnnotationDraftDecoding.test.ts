import { describe, expect, test } from 'bun:test';
import type { CodeAnnotation } from '../types';
import {
  decodeMissingCodeAnnotationDraft,
  decodeSuccessfulCodeAnnotationDraft,
} from './codeAnnotationDraftDecoding';

const codeAnnotation: CodeAnnotation = {
  id: 'code-1',
  type: 'comment',
  filePath: 'src/index.ts',
  lineStart: 4,
  lineEnd: 4,
  side: 'new',
  text: 'Check this',
  createdAt: 1718000000000,
};

describe('decodeSuccessfulCodeAnnotationDraft', () => {
  test('rejects malformed roots', () => {
    expect(decodeSuccessfulCodeAnnotationDraft(null)).toBeNull();
    expect(decodeSuccessfulCodeAnnotationDraft('draft')).toBeNull();
    expect(decodeSuccessfulCodeAnnotationDraft([])).toBeNull();
  });

  test('normalizes missing or invalid arrays to empty arrays', () => {
    expect(decodeSuccessfulCodeAnnotationDraft({})).toEqual({
      codeAnnotations: [],
      viewedFiles: [],
      draftGeneration: null,
      ts: 0,
    });
    expect(decodeSuccessfulCodeAnnotationDraft({
      codeAnnotations: 'invalid',
      viewedFiles: {},
    })).toEqual({
      codeAnnotations: [],
      viewedFiles: [],
      draftGeneration: null,
      ts: 0,
    });
  });

  test('retains valid annotation siblings while discarding malformed ones', () => {
    expect(decodeSuccessfulCodeAnnotationDraft({
      codeAnnotations: [codeAnnotation, { id: 'broken' }],
    })?.codeAnnotations).toEqual([codeAnnotation]);
  });

  test('retains valid viewed file siblings while discarding malformed values', () => {
    expect(decodeSuccessfulCodeAnnotationDraft({
      viewedFiles: ['src/index.ts', 1, '', null],
    })?.viewedFiles).toEqual(['src/index.ts', '']);
  });

  test('preserves finite timestamps and normalizes malformed ones', () => {
    expect(decodeSuccessfulCodeAnnotationDraft({ ts: 1718000001000 })?.ts).toBe(1718000001000);
    expect(decodeSuccessfulCodeAnnotationDraft({ ts: Number.POSITIVE_INFINITY })?.ts).toBe(0);
    expect(decodeSuccessfulCodeAnnotationDraft({ ts: 'invalid' })?.ts).toBe(0);
  });

  test('preserves valid draft generations and ignores malformed ones', () => {
    expect(decodeSuccessfulCodeAnnotationDraft({ draftGeneration: 0 })?.draftGeneration).toBe(0);
    expect(decodeSuccessfulCodeAnnotationDraft({ draftGeneration: 4 })?.draftGeneration).toBe(4);
    expect(decodeSuccessfulCodeAnnotationDraft({ draftGeneration: -1 })?.draftGeneration).toBeNull();
    expect(decodeSuccessfulCodeAnnotationDraft({ draftGeneration: 1.5 })?.draftGeneration).toBeNull();
    expect(decodeSuccessfulCodeAnnotationDraft({ draftGeneration: Number.POSITIVE_INFINITY })?.draftGeneration).toBeNull();
    expect(decodeSuccessfulCodeAnnotationDraft({ draftGeneration: '4' })?.draftGeneration).toBeNull();
  });
});

describe('decodeMissingCodeAnnotationDraft', () => {
  test('decodes missing responses with and without a generation', () => {
    expect(decodeMissingCodeAnnotationDraft({ found: false })).toEqual({ draftGeneration: null });
    expect(decodeMissingCodeAnnotationDraft({ found: false, draftGeneration: 0 })).toEqual({ draftGeneration: 0 });
    expect(decodeMissingCodeAnnotationDraft({ found: false, draftGeneration: 4 })).toEqual({ draftGeneration: 4 });
  });

  test('ignores malformed generations without rejecting a missing response', () => {
    expect(decodeMissingCodeAnnotationDraft({ found: false, draftGeneration: -1 })).toEqual({ draftGeneration: null });
    expect(decodeMissingCodeAnnotationDraft({ found: false, draftGeneration: 1.5 })).toEqual({ draftGeneration: null });
    expect(decodeMissingCodeAnnotationDraft({ found: false, draftGeneration: '4' })).toEqual({ draftGeneration: null });
    expect(decodeMissingCodeAnnotationDraft({ found: false, draftGeneration: Number.POSITIVE_INFINITY })).toEqual({ draftGeneration: null });
  });

  test('rejects malformed missing envelopes', () => {
    expect(decodeMissingCodeAnnotationDraft({ found: true })).toBeNull();
    expect(decodeMissingCodeAnnotationDraft({})).toBeNull();
    expect(decodeMissingCodeAnnotationDraft(null)).toBeNull();
    expect(decodeMissingCodeAnnotationDraft('missing')).toBeNull();
    expect(decodeMissingCodeAnnotationDraft([])).toBeNull();
  });
});
