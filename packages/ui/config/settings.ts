/**
 * Settings registry — declares all config settings and their resolution rules.
 *
 * Each SettingDef describes:
 *   - defaultValue: fallback (can be a lazy factory for expensive defaults)
 *   - fromCookie/toCookie: serialization to/from cookie storage
 *   - serverKey + fromServer/toServer: opt-in sync to ~/.plannotator/config.json
 *
 * Add new settings here. Cookie-only settings omit serverKey.
 */

import type { DiffLineBgIntensity } from '@plannotator/shared/config';
import { storage } from '../utils/storage';
import { generateIdentity } from '../utils/generateIdentity';

const DIFF_LINE_BG_INTENSITY_VALUES = ['subtle', 'normal', 'strong'] as const;
// SAFETY: v is untyped config value — any is intentional for runtime check
function isDiffLineBgIntensity(v: any): v is DiffLineBgIntensity {
  // SAFETY: DIFF_LINE_BG_INTENSITY_VALUES is readonly DiffLineBgIntensity[] — cast to string[] for includes
  return Object.prototype.toString.call(v) === "[object String]" && (DIFF_LINE_BG_INTENSITY_VALUES as readonly string[]).includes(v);
}

export interface SettingDef<T> {
  defaultValue: T | (() => T);
  fromCookie: () => T | undefined;
  toCookie: (value: T) => void;
  /** If set, this setting syncs to server via POST /api/config */
  serverKey?: string;
  // SAFETY: serverConfig is untyped server payload — any is intentional
  fromServer?: (serverConfig: any) => T | undefined;
  // SAFETY: server payload is untyped JSON — any is intentional for toServer
  toServer?: (value: T) => any;
}

export const SETTINGS = {
  displayName: {
    defaultValue: () => generateIdentity(),
    fromCookie: () => storage.getItem('plannotator-identity') || undefined,
    toCookie: (v: string) => storage.setItem('plannotator-identity', v),
    serverKey: 'displayName',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) =>
      Object.prototype.toString.call(sc.displayName) === "[object String]" && sc.displayName ? sc.displayName : undefined,
    toServer: (v: string) => ({ displayName: v }),
  },

  gridEnabled: {
    // Default ON: plans open in the classic grid / floating-card look. The UI 2.0
    // flat look is offered as an opt-in via the look-and-feel chooser dialog.
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: true as boolean,
    fromCookie: () => {
      const v = storage.getItem('plannotator-grid-enabled');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('plannotator-grid-enabled', String(v)),
    serverKey: undefined, fromServer: undefined, toServer: undefined,
  },

  // --- Diff display options (namespaced under diffOptions in config.json) ---

  defaultDiffType: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: 'unstaged' as 'uncommitted' | 'unstaged' | 'staged' | 'merge-base' | 'all',
    fromCookie: () => {
      const v = storage.getItem('plannotator-default-diff-type');
      if (v === 'branch') return 'merge-base' as const;
      return v === 'uncommitted' || v === 'unstaged' || v === 'staged' || v === 'merge-base' || v === 'all' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('plannotator-default-diff-type', v),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access defaultDiffType
      const v = (sc.diffOptions as any)?.defaultDiffType;
      if (v === 'branch') return 'merge-base' as const;
      return v === 'uncommitted' || v === 'unstaged' || v === 'staged' || v === 'merge-base' || v === 'all' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { defaultDiffType: v } }),
  },

  diffStyle: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: 'split' as 'split' | 'unified',
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-style') ?? storage.getItem('review-diff-style');
      return v === 'split' || v === 'unified' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('plannotator-diff-style', v),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access diffStyle
      const v = (sc.diffOptions as any)?.diffStyle;
      return v === 'split' || v === 'unified' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { diffStyle: v } }),
  },

  diffOverflow: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: 'scroll' as 'scroll' | 'wrap',
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-overflow');
      return v === 'scroll' || v === 'wrap' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('plannotator-diff-overflow', v),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access overflow
      const v = (sc.diffOptions as any)?.overflow;
      return v === 'scroll' || v === 'wrap' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { overflow: v } }),
  },

  diffIndicators: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: 'bars' as 'bars' | 'classic' | 'none',
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-indicators');
      return v === 'bars' || v === 'classic' || v === 'none' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('plannotator-diff-indicators', v),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access field
      const v = (sc.diffOptions as any)?.diffIndicators;
      return v === 'bars' || v === 'classic' || v === 'none' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { diffIndicators: v } }),
  },

  diffLineDiffType: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: 'word-alt' as 'word-alt' | 'word' | 'char' | 'none',
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-line-diff-type');
      return v === 'word-alt' || v === 'word' || v === 'char' || v === 'none' ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem('plannotator-diff-line-diff-type', v),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access field
      const v = (sc.diffOptions as any)?.lineDiffType;
      return v === 'word-alt' || v === 'word' || v === 'char' || v === 'none' ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { lineDiffType: v } }),
  },

  diffShowLineNumbers: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: true as boolean,
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-show-line-numbers');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('plannotator-diff-show-line-numbers', String(v)),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access field
      const v = (sc.diffOptions as any)?.showLineNumbers;
      return v === true || v === false ? v : undefined;
    },
    toServer: (v: boolean) => ({ diffOptions: { showLineNumbers: v } }),
  },

  diffShowBackground: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: true as boolean,
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-show-background');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('plannotator-diff-show-background', String(v)),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access field
      const v = (sc.diffOptions as any)?.showDiffBackground;
      return v === true || v === false ? v : undefined;
    },
    toServer: (v: boolean) => ({ diffOptions: { showDiffBackground: v } }),
  },

  diffFontFamily: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: '' as string, // empty = theme default
    fromCookie: () => storage.getItem('plannotator-diff-font-family') || undefined,
    toCookie: (v: string) => storage.setItem('plannotator-diff-font-family', v),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access field
      const v = (sc.diffOptions as any)?.fontFamily;
      return Object.prototype.toString.call(v) === "[object String]" ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { fontFamily: v } }),
  },

  diffHideWhitespace: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: false as boolean,
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-hide-whitespace');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('plannotator-diff-hide-whitespace', String(v)),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access field
      const v = (sc.diffOptions as any)?.hideWhitespace;
      return v === true || v === false ? v : undefined;
    },
    toServer: (v: boolean) => ({ diffOptions: { hideWhitespace: v } }),
  },

  diffExpandUnchanged: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: false as boolean,
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-expand-unchanged');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('plannotator-diff-expand-unchanged', String(v)),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access field
      const v = (sc.diffOptions as any)?.expandUnchanged;
      return v === true || v === false ? v : undefined;
    },
    toServer: (v: boolean) => ({ diffOptions: { expandUnchanged: v } }),
  },

  diffFontSize: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: '' as string, // empty = theme default
    fromCookie: () => storage.getItem('plannotator-diff-font-size') || undefined,
    toCookie: (v: string) => storage.setItem('plannotator-diff-font-size', v),
    serverKey: 'diffOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.diffOptions is untyped server payload — cast to access field
      const v = (sc.diffOptions as any)?.fontSize;
      return Object.prototype.toString.call(v) === "[object String]" ? v : undefined;
    },
    toServer: (v: string) => ({ diffOptions: { fontSize: v } }),
  },

  // --- Annotation display options (namespaced under annotationOptions) ---

  annotationCodeFontFamily: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: '' as string, // empty = theme mono/default
    fromCookie: () => storage.getItem('plannotator-annotation-code-font-family') || undefined,
    toCookie: (v: string) => storage.setItem('plannotator-annotation-code-font-family', v),
    serverKey: 'annotationOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.annotationOptions is untyped server payload — cast to access field
      const v = (sc.annotationOptions as any)?.codeFontFamily;
      return Object.prototype.toString.call(v) === "[object String]" ? v : undefined;
    },
    toServer: (v: string) => ({ annotationOptions: { codeFontFamily: v } }),
  },

  annotationCodeFontSize: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: '' as string, // empty = current 13px default
    fromCookie: () => storage.getItem('plannotator-annotation-code-font-size') || undefined,
    toCookie: (v: string) => storage.setItem('plannotator-annotation-code-font-size', v),
    serverKey: 'annotationOptions',
    // SAFETY: sc is untyped server payload — any is intentional
    fromServer: (sc: any) => {
      // SAFETY: sc.annotationOptions is untyped server payload — cast to access field
      const v = (sc.annotationOptions as any)?.codeFontSize;
      return typeof v === 'string' ? v : undefined;
    },
    toServer: (v: string) => ({ annotationOptions: { codeFontSize: v } }),
  },

  annotationProseFontFamily: {
    defaultValue: '' as string, // empty = theme sans/default
    fromCookie: () => storage.getItem('plannotator-annotation-prose-font-family') || undefined,
    toCookie: (v: string) => storage.setItem('plannotator-annotation-prose-font-family', v),
    serverKey: 'annotationOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.annotationOptions as Record<string, unknown> | undefined)?.proseFontFamily;
      return typeof v === 'string' ? v : undefined;
    },
    toServer: (v: string) => ({ annotationOptions: { proseFontFamily: v } }),
  },

  annotationProseFontSize: {
    defaultValue: '' as string, // empty = current 15px default
    fromCookie: () => storage.getItem('plannotator-annotation-prose-font-size') || undefined,
    toCookie: (v: string) => storage.setItem('plannotator-annotation-prose-font-size', v),
    serverKey: 'annotationOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.annotationOptions as Record<string, unknown> | undefined)?.proseFontSize;
      return typeof v === 'string' ? v : undefined;
    },
    toServer: (v: string) => ({ annotationOptions: { proseFontSize: v } }),
  },

  diffTabSize: {
    defaultValue: 2 as number,
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-tab-size');
      const n = v ? parseInt(v, 10) : NaN;
      return Number.isFinite(n) && n >= 1 && n <= 8 ? n : undefined;
    },
    toCookie: (v: number) => storage.setItem('plannotator-diff-tab-size', String(v)),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.tabSize;
      return typeof v === 'number' && v >= 1 && v <= 8 ? v : undefined;
    },
    toServer: (v: number) => ({ diffOptions: { tabSize: v } }),
  },
  diffLineBgIntensity: {
    defaultValue: 'subtle' as DiffLineBgIntensity,
    fromCookie: () => {
      const v = storage.getItem('plannotator-diff-line-bg-intensity');
      return isDiffLineBgIntensity(v) ? v : undefined;
    },
    toCookie: (v: DiffLineBgIntensity) =>
      storage.setItem('plannotator-diff-line-bg-intensity', v),
    serverKey: 'diffOptions',
    fromServer: (sc: Record<string, unknown>) => {
      const v = (sc.diffOptions as Record<string, unknown> | undefined)?.lineBgIntensity;
      return isDiffLineBgIntensity(v) ? v : undefined;
    },
    toServer: (v: DiffLineBgIntensity) => ({ diffOptions: { lineBgIntensity: v } }),
  },
  conventionalComments: {
    defaultValue: false as boolean,
    fromCookie: () => {
      const v = storage.getItem('plannotator-conventional-comments');
      return v === 'true' ? true : v === 'false' ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem('plannotator-conventional-comments', String(v)),
    serverKey: 'conventionalComments',
    fromServer: (sc: Record<string, unknown>) => {
      const v = sc.conventionalComments;
      return typeof v === 'boolean' ? v : undefined;
    },
    toServer: (v: boolean) => ({ conventionalComments: v }),
  },
  /** JSON-serialized array of label configs, or null for defaults.
   *  Synced to ~/.plannotator/config.json as a parsed array (not a string). */
  conventionalLabels: {
    defaultValue: null as string | null,
    fromCookie: () => storage.getItem('plannotator-cc-labels') || undefined,
    toCookie: (v: string | null) => {
      if (v) storage.setItem('plannotator-cc-labels', v);
      else storage.removeItem('plannotator-cc-labels');
    },
    serverKey: 'conventionalLabels',
    fromServer: (sc: Record<string, unknown>) => {
      const v = sc.conventionalLabels;
      if (v === null) return null;
      if (Array.isArray(v)) return JSON.stringify(v);
      return undefined;
    },
    toServer: (v: string | null) => {
      if (v === null) return { conventionalLabels: null };
      try {
        return { conventionalLabels: JSON.parse(v) };
      } catch {
        return {};
      }
    },
  },
} satisfies Record<string, SettingDef<unknown>>;

export type SettingsMap = typeof SETTINGS;
export type SettingName = keyof SettingsMap;
