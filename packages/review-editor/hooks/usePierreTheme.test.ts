import { describe, expect, test } from 'bun:test';
import { resolveSyntaxTheme } from './usePierreTheme';

describe('resolveSyntaxTheme', () => {
  test('uses the Framer Light custom Shiki theme in both modes', () => {
    const expectedTheme = {
      dark: 'plannotator-framer-light',
      light: 'plannotator-framer-light',
    };

    expect(resolveSyntaxTheme('framer-light', 'dark')).toEqual(expectedTheme);
    expect(resolveSyntaxTheme('framer-light', 'light')).toEqual(expectedTheme);
  });
});
