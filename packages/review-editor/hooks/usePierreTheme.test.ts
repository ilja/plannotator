import { describe, expect, test } from 'bun:test';
import { DEFAULT_THEMES } from '@pierre/diffs';
import {
  buildLineBgOverrides,
  resolvePierreThemeSelection,
  resolveSyntaxTheme,
} from './usePierreTheme';

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

describe('resolvePierreThemeSelection', () => {
  test('uses light rendering for Framer Light when dark mode was requested', () => {
    expect(resolvePierreThemeSelection('framer-light', 'dark')).toEqual({
      type: 'light',
      syntaxTheme: {
        dark: 'plannotator-framer-light',
        light: 'plannotator-framer-light',
      },
    });
  });

  test('uses dark rendering for Dracula when light mode was requested', () => {
    expect(resolvePierreThemeSelection('dracula', 'light')).toEqual({
      type: 'dark',
      syntaxTheme: {
        dark: 'dracula',
        light: DEFAULT_THEMES.light,
      },
    });
  });

  test('uses Pierre defaults for an unmapped palette', () => {
    expect(resolvePierreThemeSelection('simple', 'dark')).toEqual({
      type: 'dark',
      syntaxTheme: DEFAULT_THEMES,
    });
  });

  test('resets the syntax pair after switching from Framer Light to Simple', () => {
    const framer = resolvePierreThemeSelection('framer-light', 'dark');
    const simple = resolvePierreThemeSelection('simple', 'dark');

    expect(framer.syntaxTheme).not.toEqual(DEFAULT_THEMES);
    expect(simple.syntaxTheme).toEqual(DEFAULT_THEMES);
  });

  test('uses the applied palette mode for line background mixing', () => {
    const framerMode = resolvePierreThemeSelection('framer-light', 'dark').type;
    const draculaMode = resolvePierreThemeSelection('dracula', 'light').type;

    expect(buildLineBgOverrides('normal', framerMode)).toContain('calc(l - 0.07)');
    expect(buildLineBgOverrides('normal', draculaMode)).toContain('calc(l + 0.07)');
  });
});
