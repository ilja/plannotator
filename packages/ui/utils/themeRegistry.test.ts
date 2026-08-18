import { describe, expect, test } from 'bun:test';
import { BUILT_IN_THEMES, resolveAppliedThemeMode } from './themeRegistry';

describe('Framer Light theme', () => {
  test('registers the upstream palette as a light-only theme', () => {
    const theme = BUILT_IN_THEMES.find(({ id }) => id === 'framer-light');

    expect(theme).toMatchObject({
      id: 'framer-light',
      name: 'Framer Light',
      modeSupport: 'light-only',
      colors: {
        light: { background: '#fdfdfd', foreground: '#666666' },
      },
    });
    expect(theme?.syntaxHighlighting).toBeTrue();
  });
});

describe('resolveAppliedThemeMode', () => {
  test('uses light mode for a light-only palette requested in dark mode', () => {
    expect(resolveAppliedThemeMode('framer-light', 'dark')).toBe('light');
  });

  test('uses dark mode for a dark-only palette requested in light mode', () => {
    expect(resolveAppliedThemeMode('dracula', 'light')).toBe('dark');
  });

  test('preserves the requested mode for palettes that support both modes', () => {
    expect(resolveAppliedThemeMode('simple', 'dark')).toBe('dark');
    expect(resolveAppliedThemeMode('simple', 'light')).toBe('light');
  });

  test('preserves the requested mode for unknown palettes', () => {
    expect(resolveAppliedThemeMode('custom-theme', 'light')).toBe('light');
  });
});
