import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { storage } from '../utils/storage';
import { ThemeProvider, useTheme } from './ThemeProvider';

const hasDom = process.env.DOM_TESTS === '1';
const MODE_STORAGE_KEY = 'theme-provider-test-mode';
const COLOR_STORAGE_KEY = 'theme-provider-test-color';
const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

function ThemeModeProbe({ onMode }: { onMode: (mode: 'dark' | 'light') => void }) {
  onMode(useTheme().resolvedMode);
  return null;
}

async function renderTheme(defaultTheme: 'dark' | 'light', defaultColorTheme: string) {
  const container = document.createElement('div');
  const root = createRoot(container);
  let resolvedMode: 'dark' | 'light' | undefined;

  containers.push(container);
  roots.push(root);
  document.body.appendChild(container);

  await act(async () => {
    root.render(
      <ThemeProvider
        defaultTheme={defaultTheme}
        defaultColorTheme={defaultColorTheme}
        storageKey={MODE_STORAGE_KEY}
        colorThemeStorageKey={COLOR_STORAGE_KEY}
      >
        <ThemeModeProbe onMode={(mode) => { resolvedMode = mode; }} />
      </ThemeProvider>,
    );
  });

  return resolvedMode;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  for (const container of containers.splice(0)) container.remove();

  storage.removeItem(MODE_STORAGE_KEY);
  storage.removeItem(COLOR_STORAGE_KEY);
  document.documentElement.className = '';
});

describe('ThemeProvider applied palette mode', () => {
  test.skipIf(!hasDom)('applies a light-only palette without changing the resolved mode', async () => {
    const resolvedMode = await renderTheme('dark', 'framer-light');

    expect(resolvedMode).toBe('dark');
    expect(document.documentElement.classList.contains('theme-framer-light')).toBeTrue();
    expect(document.documentElement.classList.contains('light')).toBeTrue();
  });

  test.skipIf(!hasDom)('applies a dark-only palette without changing the resolved mode', async () => {
    const resolvedMode = await renderTheme('light', 'dracula');

    expect(resolvedMode).toBe('light');
    expect(document.documentElement.classList.contains('theme-dracula')).toBeTrue();
    expect(document.documentElement.classList.contains('light')).toBeFalse();
  });
});
