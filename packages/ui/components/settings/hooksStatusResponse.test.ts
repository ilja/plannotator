import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { decodeHooksStatusResponse } from './hooksStatusResponse';

const improvementHook = {
  present: true,
  filePath: '/Users/example/.plannotator/hooks/compound/enterplanmode-improve-hook.txt',
  fileSize: 2_048,
  content: 'Prefer focused tests.',
};

describe('decodeHooksStatusResponse', () => {
  test('decodes a complete hooks status response', () => {
    const decoded = decodeHooksStatusResponse({
      pfmReminder: { enabled: true },
      improvementHook,
      composedLength: 4_096,
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        pfmReminder: { enabled: true },
        improvementHook,
        composedLength: 4_096,
      });
    }
  });

  test('defaults absent optional sections for the component', () => {
    const decoded = decodeHooksStatusResponse({});

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        pfmReminder: { enabled: false },
        improvementHook: {
          present: false,
          filePath: null,
          fileSize: null,
          content: null,
        },
        composedLength: null,
      });
    }
  });

  test('retains valid PFM and composed length when the improvement hook is malformed', () => {
    const decoded = decodeHooksStatusResponse({
      pfmReminder: { enabled: true },
      improvementHook: { present: 'yes' },
      composedLength: 512,
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        pfmReminder: { enabled: true },
        improvementHook: {
          present: false,
          filePath: null,
          fileSize: null,
          content: null,
        },
        composedLength: 512,
      });
    }
  });

  test('retains a valid improvement hook when PFM and composed siblings are malformed', () => {
    const decoded = decodeHooksStatusResponse({
      pfmReminder: { enabled: 'yes' },
      improvementHook,
      composedLength: '512',
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        pfmReminder: { enabled: false },
        improvementHook,
        composedLength: null,
      });
    }
  });

  test('accepts nullable fields without coercing wrong primitive types', () => {
    const decoded = decodeHooksStatusResponse({
      pfmReminder: { enabled: 1 },
      improvementHook: {
        present: true,
        filePath: 42,
        fileSize: '2048',
        content: false,
      },
      composedLength: '4096',
    });

    expect(Result.isSuccess(decoded)).toBeTrue();
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toEqual({
        pfmReminder: { enabled: false },
        improvementHook: {
          present: false,
          filePath: null,
          fileSize: null,
          content: null,
        },
        composedLength: null,
      });
    }

    const nullable = decodeHooksStatusResponse({
      pfmReminder: { enabled: false },
      improvementHook: {
        present: true,
        filePath: null,
        fileSize: null,
        content: null,
      },
      composedLength: null,
    });

    expect(Result.isSuccess(nullable)).toBeTrue();
    if (Result.isSuccess(nullable)) {
      expect(nullable.success.improvementHook).toEqual({
        present: true,
        filePath: null,
        fileSize: null,
        content: null,
      });
      expect(nullable.success.composedLength).toBeNull();
    }
  });

  test('rejects invalid response roots', () => {
    for (const value of [null, [], 42, 'status']) {
      expect(Result.isFailure(decodeHooksStatusResponse(value))).toBeTrue();
    }
  });
});
