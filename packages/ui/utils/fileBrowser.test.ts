import { afterEach, describe, expect, test } from 'bun:test';
import { getFileBrowserSettings } from './fileBrowser';
import { storage } from './storage';

const hasDom = process.env.DOM_TESTS === '1';
const STORAGE_KEY_ENABLED = 'plannotator-filebrowser-enabled';
const STORAGE_KEY_DIRS = 'plannotator-filebrowser-dirs';

if (hasDom) window.location.href = 'http://localhost';

afterEach(() => {
  storage.removeItem(STORAGE_KEY_ENABLED);
  storage.removeItem(STORAGE_KEY_DIRS);
});

describe('getFileBrowserSettings', () => {
  test.skipIf(!hasDom)('reads valid persisted settings', () => {
    storage.setItem(STORAGE_KEY_ENABLED, 'true');
    storage.setItem(STORAGE_KEY_DIRS, JSON.stringify(['/notes', '/projects']));

    expect(getFileBrowserSettings()).toEqual({
      enabled: true,
      directories: ['/notes', '/projects'],
    });
  });

  test.skipIf(!hasDom)('returns no directories for malformed JSON', () => {
    storage.setItem(STORAGE_KEY_DIRS, '[');

    expect(getFileBrowserSettings().directories).toEqual([]);
  });

  test.skipIf(!hasDom)('returns no directories for non-array JSON roots', () => {
    for (const value of [null, {}, 'directory', 42, true]) {
      storage.setItem(STORAGE_KEY_DIRS, JSON.stringify(value));

      expect(getFileBrowserSettings().directories).toEqual([]);
    }
  });

  test.skipIf(!hasDom)('retains valid directory siblings from mixed persisted values', () => {
    storage.setItem(
      STORAGE_KEY_DIRS,
      JSON.stringify(['/notes', 42, null, '/projects', { path: '/invalid' }]),
    );

    expect(getFileBrowserSettings().directories).toEqual(['/notes', '/projects']);
  });

  test.skipIf(!hasDom)('preserves an empty directory array', () => {
    storage.setItem(STORAGE_KEY_DIRS, JSON.stringify([]));

    expect(getFileBrowserSettings().directories).toEqual([]);
  });

  test.skipIf(!hasDom)('preserves empty-string and duplicate directories in order', () => {
    storage.setItem(STORAGE_KEY_DIRS, JSON.stringify(['', '/notes', '', '/notes']));

    expect(getFileBrowserSettings().directories).toEqual(['', '/notes', '', '/notes']);
  });

  test.skipIf(!hasDom)('enables the browser only for the exact true string', () => {
    for (const value of ['true', 'TRUE', '1', 'false', ' true']) {
      storage.setItem(STORAGE_KEY_ENABLED, value);

      expect(getFileBrowserSettings().enabled).toBe(value === 'true');
    }
  });
});
