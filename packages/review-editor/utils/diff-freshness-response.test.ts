import { describe, expect, test } from 'bun:test';
import { decodeDiffFreshnessResponse } from './diff-freshness-response';

describe('decodeDiffFreshnessResponse', () => {
  test('decodes fresh and stale responses', () => {
    expect(decodeDiffFreshnessResponse({ fresh: true })).toEqual({ fresh: true });
    expect(decodeDiffFreshnessResponse({ fresh: false, fingerprint: 'abc123', agentCwd: '/tmp/review' })).toEqual({
      fresh: false,
      fingerprint: 'abc123',
      agentCwd: '/tmp/review',
    });
    expect(decodeDiffFreshnessResponse({ fresh: false, agentCwd: null })).toEqual({ fresh: false, agentCwd: null });
  });

  test('rejects malformed roots and required fresh fields', () => {
    for (const value of [null, [], {}, { fresh: undefined }, { fresh: 'yes' }, { fresh: null }]) {
      expect(decodeDiffFreshnessResponse(value)).toBeUndefined();
    }
  });

  test('omits malformed optional metadata', () => {
    expect(decodeDiffFreshnessResponse({ fresh: false, fingerprint: 42, agentCwd: '/tmp/review' })).toEqual({
      fresh: false,
      agentCwd: '/tmp/review',
    });
    expect(decodeDiffFreshnessResponse({ fresh: false, fingerprint: 'abc123', agentCwd: {} })).toEqual({
      fresh: false,
      fingerprint: 'abc123',
    });
    expect(decodeDiffFreshnessResponse({ fresh: true, fingerprint: 'abc123', agentCwd: null })).toEqual({
      fresh: true,
      fingerprint: 'abc123',
      agentCwd: null,
    });
  });
});
