import { describe, expect, test } from 'bun:test';
import { buildDefaultPrompt } from './useAIChat';

describe('buildDefaultPrompt', () => {
  test('includes line context for an attached question', () => {
    expect(buildDefaultPrompt({
      prompt: 'Why is this needed?',
      filePath: 'src/example.ts',
      lineStart: 3,
      lineEnd: 3,
      side: 'new',
      selectedCode: 'const next = true;',
    })).toBe(
      'Re: src/example.ts, line 3 (new (added) side)\n```\n' +
      'const next = true;\n```\n\nWhy is this needed?'
    );
  });

  test('leaves follow-up prompts unchanged', () => {
    expect(buildDefaultPrompt({ prompt: 'What about errors?' }))
      .toBe('What about errors?');
  });
});
