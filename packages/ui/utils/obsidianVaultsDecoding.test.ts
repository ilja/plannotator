import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { decodeObsidianVaultsResponse } from './obsidianVaultsDecoding';

describe('decodeObsidianVaultsResponse', () => {
  test('preserves valid vault paths, duplicates, and empty strings', () => {
    const decoded = decodeObsidianVaultsResponse({
      vaults: ['/notes', '', '/projects', '/notes'],
    });

    expect(Option.getOrNull(decoded)).toEqual(['/notes', '', '/projects', '/notes']);
  });

  test('rejects malformed or missing vault response envelopes', () => {
    for (const value of [null, [], {}, { vaults: null }, { vaults: {} }]) {
      expect(Option.isNone(decodeObsidianVaultsResponse(value))).toBeTrue();
    }
  });

  test('retains valid vault siblings in their original order', () => {
    const decoded = decodeObsidianVaultsResponse({
      vaults: [42, '/notes', null, '', { path: '/invalid' }, '/projects', '/notes'],
    });

    expect(Option.getOrNull(decoded)).toEqual(['/notes', '', '/projects', '/notes']);
  });
});
