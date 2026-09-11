/**
 * File Browser Settings
 *
 * Manages settings for the markdown file browser sidebar tab.
 * Users add directories to browse; settings persist via cookies.
 */

import { Option, Schema } from "effect";
import { storage } from "./storage";

const STORAGE_KEY_ENABLED = "plannotator-filebrowser-enabled";

const STORAGE_KEY_DIRS = "plannotator-filebrowser-dirs";

const DirectoryItemsSchema = Schema.Array(Schema.Unknown);

const decodeDirectoryItems = Schema.decodeUnknownOption(DirectoryItemsSchema);

const decodeDirectory = Schema.decodeUnknownOption(Schema.String);

export interface FileBrowserSettings {
  enabled: boolean;
  directories: string[];
}

function parseDirectories(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    const items = Option.getOrNull(decodeDirectoryItems(parsed));

    if (!items) return [];

    const directories: string[] = [];

    for (const item of items) {
      const directory = Option.getOrNull(decodeDirectory(item));

      if (directory !== null) directories.push(directory);
    }

    return directories;
  } catch {
    return [];
  }
}

export function getFileBrowserSettings(): FileBrowserSettings {
  const dirsRaw = storage.getItem(STORAGE_KEY_DIRS);

  return {
    enabled: storage.getItem(STORAGE_KEY_ENABLED) === "true",
    directories: dirsRaw === null ? [] : parseDirectories(dirsRaw),
  };
}

export function saveFileBrowserSettings(settings: FileBrowserSettings): void {
  storage.setItem(STORAGE_KEY_ENABLED, String(settings.enabled));
  storage.setItem(STORAGE_KEY_DIRS, JSON.stringify(settings.directories));
}

export function isFileBrowserEnabled(): boolean {
  const settings = getFileBrowserSettings();

  return settings.enabled && settings.directories.length > 0;
}
