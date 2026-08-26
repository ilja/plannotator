/**
 * Default Notes App Preference
 *
 * Stores the user's preferred notes app for the Cmd/Ctrl+S shortcut.
 * Uses cookies (not localStorage) because each hook invocation runs on a random port.
 */

import { Option, Schema } from "effect";
import { storage } from "./storage";

const STORAGE_KEY = "plannotator-default-notes-app";

export type DefaultNotesApp = "obsidian" | "bear" | "octarine" | "download" | "ask";

const decodeDefaultNotesApp = Schema.decodeUnknownOption(
  Schema.Literals(["obsidian", "bear", "octarine", "download", "ask"]),
);

export function getDefaultNotesApp(): DefaultNotesApp {
  return Option.getOrUndefined(decodeDefaultNotesApp(storage.getItem(STORAGE_KEY))) ?? "ask";
}

export function saveDefaultNotesApp(app: DefaultNotesApp): void {
  storage.setItem(STORAGE_KEY, app);
}
