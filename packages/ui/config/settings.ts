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

import type { ConfigPatch, DiffLineBgIntensity } from "@plannotator/shared/config";
import { Option, Schema } from "effect";
import { storage } from "../utils/storage";
import { generateIdentity } from "../utils/generateIdentity";
import {
  decodeStrictConventionalLabels,
  decodeStrictConventionalLabelsJson,
} from "../utils/conventionalLabelDecoding";

const RawConfigRecordSchema = Schema.Record(Schema.String, Schema.Unknown);
type RawConfigRecord = Schema.Schema.Type<typeof RawConfigRecordSchema>;

const UiServerConfigSchema = Schema.Struct({
  displayName: Schema.Unknown,
  diffOptions: RawConfigRecordSchema,
  annotationOptions: RawConfigRecordSchema,
  conventionalComments: Schema.Unknown,
  conventionalLabels: Schema.Unknown,
});
export type UiServerConfig = Schema.Schema.Type<typeof UiServerConfigSchema>;

const DefaultDiffTypeSchema = Schema.Literals([
  "uncommitted",
  "unstaged",
  "staged",
  "merge-base",
  "all",
  "branch",
]);
const DiffStyleSchema = Schema.Literals(["split", "unified"]);
const DiffOverflowSchema = Schema.Literals(["scroll", "wrap"]);
const DiffIndicatorsSchema = Schema.Literals(["bars", "classic", "none"]);
const DiffLineTypeSchema = Schema.Literals(["word-alt", "word", "char", "none"]);
const DiffLineBgIntensitySchema = Schema.Literals(["subtle", "normal", "strong"]);
const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeBoolean = Schema.decodeUnknownOption(Schema.Boolean);
const decodeNumber = Schema.decodeUnknownOption(Schema.Number);
const decodeDefaultDiffType = Schema.decodeUnknownOption(DefaultDiffTypeSchema);
const decodeDiffStyle = Schema.decodeUnknownOption(DiffStyleSchema);
const decodeDiffOverflow = Schema.decodeUnknownOption(DiffOverflowSchema);
const decodeDiffIndicators = Schema.decodeUnknownOption(DiffIndicatorsSchema);
const decodeDiffLineType = Schema.decodeUnknownOption(DiffLineTypeSchema);
const decodeDiffLineBgIntensity = Schema.decodeUnknownOption(DiffLineBgIntensitySchema);

function decodeRawConfigRecord<Input>(value: Input): RawConfigRecord {
  return Option.getOrElse(Schema.decodeUnknownOption(RawConfigRecordSchema)(value), () => ({}));
}

export function decodeUiServerConfig<Input>(value: Input): UiServerConfig {
  const root = decodeRawConfigRecord(value);
  return {
    displayName: root.displayName,
    diffOptions: decodeRawConfigRecord(root.diffOptions),
    annotationOptions: decodeRawConfigRecord(root.annotationOptions),
    conventionalComments: root.conventionalComments,
    conventionalLabels: root.conventionalLabels,
  };
}

function readString<Input>(value: Input): string | undefined {
  return Option.getOrUndefined(decodeString(value));
}

function readBoolean<Input>(value: Input): boolean | undefined {
  return Option.getOrUndefined(decodeBoolean(value));
}

function readDiffLineBgIntensity<Input>(value: Input): DiffLineBgIntensity | undefined {
  return Option.getOrUndefined(decodeDiffLineBgIntensity(value));
}

export interface SettingDef<T> {
  defaultValue: T | (() => T);
  fromCookie: () => T | undefined;
  toCookie: (value: T) => void;
  /** If set, this setting syncs to server via POST /api/config */
  serverKey?: string;
  fromServer?: (serverConfig: UiServerConfig) => T | undefined;
  toServer?: (value: T) => ConfigPatch;
}

export const SETTINGS = {
  displayName: {
    defaultValue: () => generateIdentity(),
    fromCookie: () => storage.getItem("plannotator-identity") || undefined,
    toCookie: (v: string) => storage.setItem("plannotator-identity", v),
    serverKey: "displayName",
    fromServer: (sc) => readString(sc.displayName) || undefined,
    toServer: (v: string) => ({ displayName: v }),
  },

  gridEnabled: {
    // Default ON: plans open in the classic grid / floating-card look. The UI 2.0
    // flat look is offered as an opt-in via the look-and-feel chooser dialog.
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: true as boolean,
    fromCookie: () => {
      const v = storage.getItem("plannotator-grid-enabled");
      return v === "true" ? true : v === "false" ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem("plannotator-grid-enabled", String(v)),
    serverKey: undefined,
    fromServer: undefined,
    toServer: undefined,
  },

  // --- Diff display options (namespaced under diffOptions in config.json) ---

  defaultDiffType: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "all" as "uncommitted" | "unstaged" | "staged" | "merge-base" | "all",
    fromCookie: () => {
      const v = storage.getItem("plannotator-default-diff-type");
      if (v === "branch") return "merge-base" as const;
      return v === "uncommitted" ||
        v === "unstaged" ||
        v === "staged" ||
        v === "merge-base" ||
        v === "all"
        ? v
        : undefined;
    },
    toCookie: (v: string) => storage.setItem("plannotator-default-diff-type", v),
    serverKey: "diffOptions",
    fromServer: (sc) => {
      const value = Option.getOrUndefined(decodeDefaultDiffType(sc.diffOptions.defaultDiffType));
      return value === "branch" ? "merge-base" : value;
    },
    toServer: (v: "uncommitted" | "unstaged" | "staged" | "merge-base" | "all") => ({
      diffOptions: { defaultDiffType: v },
    }),
  },

  diffStyle: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "split" as "split" | "unified",
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-style") ?? storage.getItem("review-diff-style");
      return v === "split" || v === "unified" ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem("plannotator-diff-style", v),
    serverKey: "diffOptions",
    fromServer: (sc) => Option.getOrUndefined(decodeDiffStyle(sc.diffOptions.diffStyle)),
    toServer: (v: "split" | "unified") => ({ diffOptions: { diffStyle: v } }),
  },

  diffOverflow: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "scroll" as "scroll" | "wrap",
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-overflow");
      return v === "scroll" || v === "wrap" ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem("plannotator-diff-overflow", v),
    serverKey: "diffOptions",
    fromServer: (sc) => Option.getOrUndefined(decodeDiffOverflow(sc.diffOptions.overflow)),
    toServer: (v: "scroll" | "wrap") => ({ diffOptions: { overflow: v } }),
  },

  diffIndicators: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "bars" as "bars" | "classic" | "none",
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-indicators");
      return v === "bars" || v === "classic" || v === "none" ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem("plannotator-diff-indicators", v),
    serverKey: "diffOptions",
    fromServer: (sc) => Option.getOrUndefined(decodeDiffIndicators(sc.diffOptions.diffIndicators)),
    toServer: (v: "bars" | "classic" | "none") => ({ diffOptions: { diffIndicators: v } }),
  },

  diffLineDiffType: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "word-alt" as "word-alt" | "word" | "char" | "none",
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-line-diff-type");
      return v === "word-alt" || v === "word" || v === "char" || v === "none" ? v : undefined;
    },
    toCookie: (v: string) => storage.setItem("plannotator-diff-line-diff-type", v),
    serverKey: "diffOptions",
    fromServer: (sc) => Option.getOrUndefined(decodeDiffLineType(sc.diffOptions.lineDiffType)),
    toServer: (v: "word-alt" | "word" | "char" | "none") => ({
      diffOptions: { lineDiffType: v },
    }),
  },

  diffShowLineNumbers: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: true as boolean,
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-show-line-numbers");
      return v === "true" ? true : v === "false" ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem("plannotator-diff-show-line-numbers", String(v)),
    serverKey: "diffOptions",
    fromServer: (sc) => readBoolean(sc.diffOptions.showLineNumbers),
    toServer: (v: boolean) => ({ diffOptions: { showLineNumbers: v } }),
  },

  diffShowBackground: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: true as boolean,
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-show-background");
      return v === "true" ? true : v === "false" ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem("plannotator-diff-show-background", String(v)),
    serverKey: "diffOptions",
    fromServer: (sc) => readBoolean(sc.diffOptions.showDiffBackground),
    toServer: (v: boolean) => ({ diffOptions: { showDiffBackground: v } }),
  },

  diffFontFamily: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "" as string, // empty = theme default
    fromCookie: () => storage.getItem("plannotator-diff-font-family") || undefined,
    toCookie: (v: string) => storage.setItem("plannotator-diff-font-family", v),
    serverKey: "diffOptions",
    fromServer: (sc) => readString(sc.diffOptions.fontFamily),
    toServer: (v: string) => ({ diffOptions: { fontFamily: v } }),
  },

  diffHideWhitespace: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: false as boolean,
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-hide-whitespace");
      return v === "true" ? true : v === "false" ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem("plannotator-diff-hide-whitespace", String(v)),
    serverKey: "diffOptions",
    fromServer: (sc) => readBoolean(sc.diffOptions.hideWhitespace),
    toServer: (v: boolean) => ({ diffOptions: { hideWhitespace: v } }),
  },

  diffExpandUnchanged: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: false as boolean,
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-expand-unchanged");
      return v === "true" ? true : v === "false" ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem("plannotator-diff-expand-unchanged", String(v)),
    serverKey: "diffOptions",
    fromServer: (sc) => readBoolean(sc.diffOptions.expandUnchanged),
    toServer: (v: boolean) => ({ diffOptions: { expandUnchanged: v } }),
  },

  diffFontSize: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "" as string, // empty = theme default
    fromCookie: () => storage.getItem("plannotator-diff-font-size") || undefined,
    toCookie: (v: string) => storage.setItem("plannotator-diff-font-size", v),
    serverKey: "diffOptions",
    fromServer: (sc) => readString(sc.diffOptions.fontSize),
    toServer: (v: string) => ({ diffOptions: { fontSize: v } }),
  },

  // --- Annotation display options (namespaced under annotationOptions) ---

  annotationCodeFontFamily: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "" as string, // empty = theme mono/default
    fromCookie: () => storage.getItem("plannotator-annotation-code-font-family") || undefined,
    toCookie: (v: string) => storage.setItem("plannotator-annotation-code-font-family", v),
    serverKey: "annotationOptions",
    fromServer: (sc) => readString(sc.annotationOptions.codeFontFamily),
    toServer: (v: string) => ({ annotationOptions: { codeFontFamily: v } }),
  },

  annotationCodeFontSize: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "" as string, // empty = current 13px default
    fromCookie: () => storage.getItem("plannotator-annotation-code-font-size") || undefined,
    toCookie: (v: string) => storage.setItem("plannotator-annotation-code-font-size", v),
    serverKey: "annotationOptions",
    fromServer: (sc) => readString(sc.annotationOptions.codeFontSize),
    toServer: (v: string) => ({ annotationOptions: { codeFontSize: v } }),
  },

  annotationProseFontFamily: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "" as string, // empty = theme sans/default
    fromCookie: () => storage.getItem("plannotator-annotation-prose-font-family") || undefined,
    toCookie: (v: string) => storage.setItem("plannotator-annotation-prose-font-family", v),
    serverKey: "annotationOptions",
    fromServer: (sc) => readString(sc.annotationOptions.proseFontFamily),
    toServer: (v: string) => ({ annotationOptions: { proseFontFamily: v } }),
  },

  annotationProseFontSize: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "" as string, // empty = current 15px default
    fromCookie: () => storage.getItem("plannotator-annotation-prose-font-size") || undefined,
    toCookie: (v: string) => storage.setItem("plannotator-annotation-prose-font-size", v),
    serverKey: "annotationOptions",
    fromServer: (sc) => readString(sc.annotationOptions.proseFontSize),
    toServer: (v: string) => ({ annotationOptions: { proseFontSize: v } }),
  },

  diffTabSize: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: 2 as number,
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-tab-size");
      const n = v ? parseInt(v, 10) : NaN;
      return Number.isFinite(n) && n >= 1 && n <= 8 ? n : undefined;
    },
    toCookie: (v: number) => storage.setItem("plannotator-diff-tab-size", String(v)),
    serverKey: "diffOptions",
    fromServer: (sc) => {
      const value = Option.getOrUndefined(decodeNumber(sc.diffOptions.tabSize));
      return value !== undefined && value >= 1 && value <= 8 ? value : undefined;
    },
    toServer: (v: number) => ({ diffOptions: { tabSize: v } }),
  },
  diffLineBgIntensity: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: "subtle" as DiffLineBgIntensity,
    fromCookie: () => {
      const v = storage.getItem("plannotator-diff-line-bg-intensity");
      return readDiffLineBgIntensity(v);
    },
    toCookie: (v: DiffLineBgIntensity) => storage.setItem("plannotator-diff-line-bg-intensity", v),
    serverKey: "diffOptions",
    fromServer: (sc) => readDiffLineBgIntensity(sc.diffOptions.lineBgIntensity),
    toServer: (v: DiffLineBgIntensity) => ({ diffOptions: { lineBgIntensity: v } }),
  },
  conventionalComments: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: false as boolean,
    fromCookie: () => {
      const v = storage.getItem("plannotator-conventional-comments");
      return v === "true" ? true : v === "false" ? false : undefined;
    },
    toCookie: (v: boolean) => storage.setItem("plannotator-conventional-comments", String(v)),
    serverKey: "conventionalComments",
    fromServer: (sc) => readBoolean(sc.conventionalComments),
    toServer: (v: boolean) => ({ conventionalComments: v }),
  },
  /** JSON-serialized array of label configs, or null for defaults.
   *  Synced to ~/.plannotator/config.json as a parsed array (not a string). */
  conventionalLabels: {
    // SAFETY: literal widened to SettingDef value type — required for generic inference
    defaultValue: null as string | null,
    fromCookie: () => storage.getItem("plannotator-cc-labels") || undefined,
    toCookie: (v: string | null) => {
      if (v) storage.setItem("plannotator-cc-labels", v);
      else storage.removeItem("plannotator-cc-labels");
    },
    serverKey: "conventionalLabels",
    fromServer: (sc) => {
      const labels = decodeStrictConventionalLabels(sc.conventionalLabels);
      if (labels === undefined || labels === null) return labels;
      return JSON.stringify(labels);
    },
    toServer: (v: string | null) => {
      if (v === null) return { conventionalLabels: null };
      const labels = decodeStrictConventionalLabelsJson(v);
      return labels === undefined ? {} : { conventionalLabels: labels };
    },
  },
} satisfies Record<string, SettingDef<unknown>>;

export type SettingsMap = typeof SETTINGS;
export type SettingName = keyof SettingsMap;
