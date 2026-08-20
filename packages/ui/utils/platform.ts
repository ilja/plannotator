/**
 * Platform detection for keyboard shortcut hints.
 *
 * Canonical source — import from here instead of inlining navigator checks.
 * Used across the plan editor, code review, and shared UI components.
 */
export const isMac = globalThis.navigator !== undefined && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';
export const altKey = isMac ? '⌥' : 'Alt';
export const submitHint = isMac ? '⌘↵' : 'Ctrl+Enter';
export const isWindows = globalThis.navigator !== undefined && /^Win/.test(navigator.platform);
