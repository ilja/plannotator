/**
 * Plannotator Config
 *
 * Reads/writes ~/.plannotator/config.json for persistent user settings.
 * Runtime-agnostic: uses only node:fs, node:os, node:child_process.
 */

import { join } from "path";
import { getPlannotatorDataDir } from "./data-dir";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { Option, Schema } from "effect";

export type DefaultDiffType = 'uncommitted' | 'unstaged' | 'staged' | 'merge-base' | 'all';
export type DiffLineBgIntensity = 'subtle' | 'normal' | 'strong';

export interface DiffOptions {
  diffStyle?: 'split' | 'unified';
  overflow?: 'scroll' | 'wrap';
  diffIndicators?: 'bars' | 'classic' | 'none';
  lineDiffType?: 'word-alt' | 'word' | 'char' | 'none';
  showLineNumbers?: boolean;
  showDiffBackground?: boolean;
  fontFamily?: string;
  fontSize?: string;
  tabSize?: number;
  hideWhitespace?: boolean;
  expandUnchanged?: boolean;
  defaultDiffType?: DefaultDiffType;
  lineBgIntensity?: DiffLineBgIntensity;
}

export interface AnnotationOptions {
  proseFontFamily?: string;
  proseFontSize?: string;
  codeFontFamily?: string;
  codeFontSize?: string;
}

/** Single conventional comment label entry stored in config.json */
export interface CCLabelConfig {
  label: string;
  display: string;
  blocking: boolean;
}

export type PromptSectionOverrides = Record<string, string | undefined>;

export type PromptRuntime =
  | "claude-code"
  | "amp"
  | "droid"
  | "kiro-cli"
  | "opencode"
  | "copilot-cli"
  | "pi"
  | "codex"
  | "gemini-cli";

interface PromptSectionConfig {
  [key: string]: string | Partial<Record<PromptRuntime, PromptSectionOverrides>> | undefined;
  runtimes?: Partial<Record<PromptRuntime, PromptSectionOverrides>>;
}

export interface PromptConfig {
  review?: PromptSectionConfig & {
    approved?: string;
    denied?: string;
  };
  plan?: PromptSectionConfig & {
    approved?: string;
    approvedWithNotes?: string;
    autoApproved?: string;
    denied?: string;
  };
  annotate?: PromptSectionConfig & {
    fileFeedback?: string;
    messageFeedback?: string;
    approved?: string;
  };
}

const PROMPT_SECTIONS = ["review", "plan", "annotate"] as const;

export function mergePromptConfig(
  current?: PromptConfig,
  partial?: PromptConfig,
): PromptConfig | undefined {
  if (!current && !partial) return undefined;

  const result: PromptConfig = { ...current, ...partial };

  for (const section of PROMPT_SECTIONS) {
    const cur = current?.[section];
    const par = partial?.[section];
    if (cur || par) {
      result[section] = {
        ...cur,
        ...par,
        runtimes: (cur?.runtimes || par?.runtimes)
          ? { ...cur?.runtimes, ...par?.runtimes }
          : undefined,
      };
    }
  }

  return result;
}

export interface PlannotatorConfig {
  displayName?: string;
  diffOptions?: DiffOptions;
  annotationOptions?: AnnotationOptions;
  prompts?: PromptConfig;
  conventionalComments?: boolean;
  /** null = explicitly cleared (use defaults), undefined = not set */
  conventionalLabels?: CCLabelConfig[] | null;
  /**
   * Enable Jina Reader for URL-to-markdown conversion during annotation.
   * When true (default), `plannotator annotate <url>` routes through
   * r.jina.ai for better JS-rendered page support and reader-mode extraction.
   * Set to false to always use plain fetch + Turndown.
   */
  jina?: boolean;
  /**
   * Inject a Plannotator Flavored Markdown reminder into every EnterPlanMode
   * call so the agent is aware it can enrich plans with code-file links,
   * callouts, tables, diagrams, task lists, and the other PFM extensions.
   * Read by the `improve-context` PreToolUse handler. Default: false.
   */
  pfmReminder?: boolean;
  /**
   * Open Plannotator in a Glimpse native window when available.
   * When true (default), the server spawns `glimpseui` if it is on PATH,
   * no explicit browser is configured, and the session is local.
   * Set to false to always use the system browser even when Glimpse is installed.
   */
  glimpse?: boolean;
  /**
   * Control URL sharing (Share tab, copy link, short URLs, import review).
   * Defaults to enabled. Set to "disabled" to hide all sharing UI — useful
   * for teams working with sensitive plans. Mirrors the PLANNOTATOR_SHARE
   * env var value, which takes precedence over this setting.
   */
  share?: "enabled" | "disabled";
}

const CONFIG_DIR = getPlannotatorDataDir();
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const ConfigJson = Schema.Json;
type ConfigJson = Schema.Schema.Type<typeof ConfigJson>;
const ConfigRecord = Schema.Record(Schema.String, ConfigJson);
const ConfigString = Schema.String;
const ConfigBoolean = Schema.Boolean;
const ConfigNumber = Schema.Number;
const ConfigDiffType = Schema.Literals(["uncommitted", "unstaged", "staged", "merge-base", "all", "branch"]);
const ConfigShare = Schema.Literals(["enabled", "disabled"]);
const ConfigDiffStyle = Schema.Literals(["split", "unified"]);
const ConfigOverflow = Schema.Literals(["scroll", "wrap"]);
const ConfigDiffIndicators = Schema.Literals(["bars", "classic", "none"]);
const ConfigLineDiffType = Schema.Literals(["word-alt", "word", "char", "none"]);
const ConfigLineBgIntensity = Schema.Literals(["subtle", "normal", "strong"]);

function decodeConfigRecord(value: ConfigJson | undefined): Record<string, ConfigJson> | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(ConfigRecord)(value));
}

function decodeConfigString(value: ConfigJson | undefined): string | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(ConfigString)(value));
}

function decodeConfigBoolean(value: ConfigJson | undefined): boolean | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(ConfigBoolean)(value));
}

function decodeConfigNumber(value: ConfigJson | undefined): number | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(ConfigNumber)(value));
}

function decodeDiffOptions(value: ConfigJson | undefined): DiffOptions | undefined {
  const record = decodeConfigRecord(value);
  if (!record) return undefined;

  const result: DiffOptions = {};
  Object.assign(result, record);
  const diffStyle = Option.getOrUndefined(Schema.decodeUnknownOption(ConfigDiffStyle)(record.diffStyle));
  const overflow = Option.getOrUndefined(Schema.decodeUnknownOption(ConfigOverflow)(record.overflow));
  const diffIndicators = Option.getOrUndefined(Schema.decodeUnknownOption(ConfigDiffIndicators)(record.diffIndicators));
  const lineDiffType = Option.getOrUndefined(Schema.decodeUnknownOption(ConfigLineDiffType)(record.lineDiffType));
  const showLineNumbers = decodeConfigBoolean(record.showLineNumbers);
  const showDiffBackground = decodeConfigBoolean(record.showDiffBackground);
  const fontFamily = decodeConfigString(record.fontFamily);
  const fontSize = decodeConfigString(record.fontSize);
  const tabSize = decodeConfigNumber(record.tabSize);
  const hideWhitespace = decodeConfigBoolean(record.hideWhitespace);
  const expandUnchanged = decodeConfigBoolean(record.expandUnchanged);
  const defaultDiffType = Option.getOrUndefined(Schema.decodeUnknownOption(ConfigDiffType)(record.defaultDiffType));
  const lineBgIntensity = Option.getOrUndefined(Schema.decodeUnknownOption(ConfigLineBgIntensity)(record.lineBgIntensity));

  delete result.diffStyle;
  delete result.overflow;
  delete result.diffIndicators;
  delete result.lineDiffType;
  delete result.showLineNumbers;
  delete result.showDiffBackground;
  delete result.fontFamily;
  delete result.fontSize;
  delete result.tabSize;
  delete result.hideWhitespace;
  delete result.expandUnchanged;
  delete result.defaultDiffType;
  delete result.lineBgIntensity;

  if (diffStyle !== undefined) result.diffStyle = diffStyle;
  if (overflow !== undefined) result.overflow = overflow;
  if (diffIndicators !== undefined) result.diffIndicators = diffIndicators;
  if (lineDiffType !== undefined) result.lineDiffType = lineDiffType;
  if (showLineNumbers !== undefined) result.showLineNumbers = showLineNumbers;
  if (showDiffBackground !== undefined) result.showDiffBackground = showDiffBackground;
  if (fontFamily !== undefined) result.fontFamily = fontFamily;
  if (fontSize !== undefined) result.fontSize = fontSize;
  if (tabSize !== undefined) result.tabSize = tabSize;
  if (hideWhitespace !== undefined) result.hideWhitespace = hideWhitespace;
  if (expandUnchanged !== undefined) result.expandUnchanged = expandUnchanged;
  if (defaultDiffType !== undefined) result.defaultDiffType = defaultDiffType === "branch" ? "merge-base" : defaultDiffType;
  if (lineBgIntensity !== undefined) result.lineBgIntensity = lineBgIntensity;

  return result;
}

function decodeAnnotationOptions(value: ConfigJson | undefined): AnnotationOptions | undefined {
  const record = decodeConfigRecord(value);
  if (!record) return undefined;

  const result: AnnotationOptions = {};
  Object.assign(result, record);
  const proseFontFamily = decodeConfigString(record.proseFontFamily);
  const proseFontSize = decodeConfigString(record.proseFontSize);
  const codeFontFamily = decodeConfigString(record.codeFontFamily);
  const codeFontSize = decodeConfigString(record.codeFontSize);

  delete result.proseFontFamily;
  delete result.proseFontSize;
  delete result.codeFontFamily;
  delete result.codeFontSize;

  if (proseFontFamily !== undefined) result.proseFontFamily = proseFontFamily;
  if (proseFontSize !== undefined) result.proseFontSize = proseFontSize;
  if (codeFontFamily !== undefined) result.codeFontFamily = codeFontFamily;
  if (codeFontSize !== undefined) result.codeFontSize = codeFontSize;

  return result;
}

function decodeConventionalLabels(value: ConfigJson | undefined): CCLabelConfig[] | null | undefined {
  if (value === null) return null;
  const labels = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Array(ConfigJson))(value));
  if (!labels) return undefined;

  return labels.flatMap((label): CCLabelConfig[] => {
    const record = decodeConfigRecord(label);
    if (!record) return [];
    const labelValue = decodeConfigString(record.label);
    const display = decodeConfigString(record.display);
    const blocking = decodeConfigBoolean(record.blocking);
    if (labelValue === undefined || display === undefined || blocking === undefined) return [];

    const decodedLabel: CCLabelConfig = { label: labelValue, display, blocking };
    Object.assign(decodedLabel, record, { label: labelValue, display, blocking });
    return [decodedLabel];
  });
}

function decodePromptRuntimes(value: ConfigJson | undefined): Record<string, PromptSectionOverrides | undefined> | undefined {
  const runtimes = decodeConfigRecord(value);
  if (!runtimes) return undefined;

  const result: Record<string, PromptSectionOverrides | undefined> = {};
  for (const [runtime, overrides] of Object.entries(runtimes)) {
    const record = decodeConfigRecord(overrides);
    if (!record) continue;

    const decodedOverrides: PromptSectionOverrides = {};
    for (const [key, override] of Object.entries(record)) {
      const decoded = decodeConfigString(override);
      if (decoded !== undefined) decodedOverrides[key] = decoded;
    }
    result[runtime] = decodedOverrides;
  }
  return result;
}

function decodePromptSection(value: ConfigJson | undefined, fields: readonly string[]): PromptSectionConfig | undefined {
  const record = decodeConfigRecord(value);
  if (!record) return undefined;

  const result: PromptSectionConfig = {};
  Object.assign(result, record);
  for (const field of fields) {
    delete result[field];
    const decoded = decodeConfigString(record[field]);
    if (decoded !== undefined) result[field] = decoded;
  }

  delete result.runtimes;
  const runtimes = decodePromptRuntimes(record.runtimes);
  if (runtimes !== undefined) Object.assign(result, { runtimes });

  return result;
}

function decodePrompts(value: ConfigJson | undefined): PromptConfig | undefined {
  const record = decodeConfigRecord(value);
  if (!record) return undefined;

  const result: PromptConfig = {};
  Object.assign(result, record);
  const review = decodePromptSection(record.review, ["approved", "denied"]);
  const plan = decodePromptSection(record.plan, ["approved", "approvedWithNotes", "autoApproved", "denied"]);
  const annotate = decodePromptSection(record.annotate, ["fileFeedback", "messageFeedback", "approved"]);

  delete result.review;
  delete result.plan;
  delete result.annotate;
  if (review !== undefined) result.review = review;
  if (plan !== undefined) result.plan = plan;
  if (annotate !== undefined) result.annotate = annotate;

  return result;
}

/**
 * Load config from ~/.plannotator/config.json.
 * Returns {} on missing file or malformed JSON.
 */
export function loadConfig(): PlannotatorConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const record = Option.getOrUndefined(Schema.decodeUnknownOption(ConfigRecord)(parsed));
    if (!record) return {};

    const config: PlannotatorConfig = {};
    Object.assign(config, record);
    const displayName = decodeConfigString(record.displayName);
    const diffOptions = decodeDiffOptions(record.diffOptions);
    const annotationOptions = decodeAnnotationOptions(record.annotationOptions);
    const prompts = decodePrompts(record.prompts);
    const conventionalComments = decodeConfigBoolean(record.conventionalComments);
    const conventionalLabels = decodeConventionalLabels(record.conventionalLabels);
    const jina = decodeConfigBoolean(record.jina);
    const pfmReminder = decodeConfigBoolean(record.pfmReminder);
    const glimpse = decodeConfigBoolean(record.glimpse);
    const share = Option.getOrUndefined(Schema.decodeUnknownOption(ConfigShare)(record.share));

    delete config.displayName;
    delete config.diffOptions;
    delete config.annotationOptions;
    delete config.prompts;
    delete config.conventionalComments;
    delete config.conventionalLabels;
    delete config.jina;
    delete config.pfmReminder;
    delete config.glimpse;
    delete config.share;

    if (displayName !== undefined) config.displayName = displayName;
    if (diffOptions !== undefined) config.diffOptions = diffOptions;
    if (annotationOptions !== undefined) config.annotationOptions = annotationOptions;
    if (prompts !== undefined) config.prompts = prompts;
    if (conventionalComments !== undefined) config.conventionalComments = conventionalComments;
    if (conventionalLabels !== undefined) config.conventionalLabels = conventionalLabels;
    if (jina !== undefined) config.jina = jina;
    if (pfmReminder !== undefined) config.pfmReminder = pfmReminder;
    if (glimpse !== undefined) config.glimpse = glimpse;
    if (share !== undefined) config.share = share;

    return config;
  } catch (e) {
    process.stderr.write(`[plannotator] Warning: failed to read config.json: ${e}\n`);
    return {};
  }
}

/**
 * Partial config accepted from the config update endpoint. Decode the request
 * body with this schema at the HTTP boundary; saveConfig takes the result.
 */
export const ConfigPatch = Schema.Struct({
  pfmReminder: Schema.optionalKey(Schema.Boolean),
  displayName: Schema.optionalKey(Schema.String),
  conventionalComments: Schema.optionalKey(Schema.Boolean),
  diffOptions: Schema.optionalKey(
    Schema.Struct({
      diffStyle: Schema.optionalKey(Schema.Literals(["split", "unified"])),
      overflow: Schema.optionalKey(Schema.Literals(["scroll", "wrap"])),
      diffIndicators: Schema.optionalKey(Schema.Literals(["bars", "classic", "none"])),
      lineDiffType: Schema.optionalKey(Schema.Literals(["word-alt", "word", "char", "none"])),
      showLineNumbers: Schema.optionalKey(Schema.Boolean),
      showDiffBackground: Schema.optionalKey(Schema.Boolean),
      fontFamily: Schema.optionalKey(Schema.String),
      fontSize: Schema.optionalKey(Schema.String),
      tabSize: Schema.optionalKey(Schema.Number),
      hideWhitespace: Schema.optionalKey(Schema.Boolean),
      expandUnchanged: Schema.optionalKey(Schema.Boolean),
      defaultDiffType: Schema.optionalKey(Schema.Literals(["uncommitted", "unstaged", "staged", "merge-base", "all"])),
      lineBgIntensity: Schema.optionalKey(Schema.Literals(["subtle", "normal", "strong"])),
    }),
  ),
  annotationOptions: Schema.optionalKey(
    Schema.Struct({
      proseFontFamily: Schema.optionalKey(Schema.String),
      proseFontSize: Schema.optionalKey(Schema.String),
      codeFontFamily: Schema.optionalKey(Schema.String),
      codeFontSize: Schema.optionalKey(Schema.String),
    }),
  ),
  conventionalLabels: Schema.optionalKey(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          label: Schema.String,
          display: Schema.String,
          blocking: Schema.Boolean,
        }),
      ),
    ),
  ),
});

export type ConfigPatch = Schema.Schema.Type<typeof ConfigPatch>;

/**
 * Save config by merging partial values into the existing file.
 * Creates ~/.plannotator/ directory if needed.
 */
export function saveConfig(partial: Partial<PlannotatorConfig> | ConfigPatch): void {
  try {
    const current = loadConfig();
    const mergedDiffOptions = (current.diffOptions || partial.diffOptions)
      ? { ...current.diffOptions, ...partial.diffOptions }
      : undefined;
    const mergedAnnotationOptions = (current.annotationOptions || partial.annotationOptions)
      ? { ...current.annotationOptions, ...partial.annotationOptions }
      : undefined;
    const mergedPrompts = mergePromptConfig(
      current.prompts,
      "prompts" in partial ? partial.prompts : undefined,
    );
    const merged = {
      ...current,
      ...partial,
      diffOptions: mergedDiffOptions,
      annotationOptions: mergedAnnotationOptions,
      prompts: mergedPrompts,
    };
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  } catch (e) {
    process.stderr.write(`[plannotator] Warning: failed to write config.json: ${e}\n`);
  }
}

/**
 * Detect the git user name from `git config user.name`.
 * Returns null if git is unavailable, not in a repo, or user.name is not set.
 */
export function detectGitUser(): string | null {
  try {
    const name = execSync("git config user.name", { encoding: "utf-8", timeout: 3000 }).trim();
    return name || null;
  } catch {
    return null;
  }
}

interface ServerConfigPayload {
  readonly displayName?: string;
  readonly diffOptions?: DiffOptions;
  readonly annotationOptions?: AnnotationOptions;
  readonly gitUser?: string;
  readonly conventionalComments?: boolean;
  readonly conventionalLabels?: CCLabelConfig[] | null;
}

/**
 * Build the serverConfig payload for API responses.
 * Reads config.json fresh each call so the response reflects the latest file on disk.
 */
export function getServerConfig(gitUser: string | null): ServerConfigPayload {
  const cfg = loadConfig();
  return {
    displayName: cfg.displayName,
    diffOptions: cfg.diffOptions,
    annotationOptions: cfg.annotationOptions,
    gitUser: gitUser ?? undefined,
    ...(cfg.conventionalComments !== undefined && { conventionalComments: cfg.conventionalComments }),
    ...(cfg.conventionalLabels !== undefined && { conventionalLabels: cfg.conventionalLabels }),
  };
}

/**
 * Read the user's preferred default diff type from config, falling back to 'unstaged'.
 */
export function resolveDefaultDiffType(cfg?: PlannotatorConfig): DefaultDiffType {
  const v: string | undefined = cfg?.diffOptions?.defaultDiffType;
  if (v === 'branch') return 'merge-base';
  return v === 'uncommitted' || v === 'unstaged' || v === 'staged' || v === 'merge-base' || v === 'all' ? v : 'unstaged';
}

/**
 * Resolve whether to use Glimpse native window.
 *
 * Priority (highest wins):
 *   PLANNOTATOR_GLIMPSE env var  →  config.glimpse  →  default true
 */
export function resolveUseGlimpse(config: PlannotatorConfig): boolean {
  const envVal = process.env.PLANNOTATOR_GLIMPSE;
  if (envVal !== undefined) {
    return envVal === "1" || envVal.toLowerCase() === "true";
  }
  if (config.glimpse !== undefined) return config.glimpse;
  return true;
}

/**
 * Resolve whether to use Jina Reader for URL annotation.
 *
 * Priority (highest wins):
 *   --no-jina CLI flag  →  PLANNOTATOR_JINA env var  →  config.jina  →  default true
 */
export function resolveUseJina(cliNoJina: boolean, config: PlannotatorConfig): boolean {
  // CLI flag has highest priority
  if (cliNoJina) return false;

  // Environment variable
  const envVal = process.env.PLANNOTATOR_JINA;
  if (envVal !== undefined) {
    return envVal === "1" || envVal.toLowerCase() === "true";
  }

  // Config file
  if (config.jina !== undefined) return config.jina;

  // Default: enabled
  return true;
}

/**
 * Resolve whether URL sharing is enabled.
 *
 * Priority (highest wins):
 *   PLANNOTATOR_SHARE env var  →  config.share  →  default true
 */
export function resolveSharingEnabled(config: PlannotatorConfig): boolean {
  const envVal = process.env.PLANNOTATOR_SHARE;
  if (envVal !== undefined) return envVal !== "disabled";
  if (config.share !== undefined) return config.share !== "disabled";
  return true;
}
