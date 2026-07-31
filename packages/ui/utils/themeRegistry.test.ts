import { describe, expect, test } from 'bun:test';
import { BUILT_IN_THEMES } from './themeRegistry';

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
