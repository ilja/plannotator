import { describe, expect, test } from 'bun:test';
import { DEFAULT_QUICK_LABELS, decodeStoredQuickLabels } from './quickLabels';

describe('decodeStoredQuickLabels', () => {
  test('keeps valid stored labels while filtering malformed siblings', () => {
    expect(decodeStoredQuickLabels(JSON.stringify([
      { id: 'needs-tests', emoji: '🧪', text: 'Needs tests', color: 'blue' },
      { id: 'broken', emoji: 42, text: 'Broken', color: 'red' },
      { id: 'verify-this', emoji: '🔍', text: 'Verify this', color: 'orange', tip: 'Check it' },
    ]))).toEqual([
      { id: 'needs-tests', emoji: '🧪', text: 'Needs tests', color: 'blue' },
      { id: 'verify-this', emoji: '🔍', text: 'Verify this', color: 'orange', tip: 'Check it' },
    ]);
  });

  test('uses defaults for malformed JSON, non-arrays, and empty valid arrays', () => {
    expect(decodeStoredQuickLabels('{')).toEqual(DEFAULT_QUICK_LABELS);
    expect(decodeStoredQuickLabels(JSON.stringify({ id: 'not-an-array' }))).toEqual(DEFAULT_QUICK_LABELS);
    expect(decodeStoredQuickLabels(JSON.stringify([]))).toEqual(DEFAULT_QUICK_LABELS);
  });
});
