import { resolveAppliedThemeMode } from "./themeRegistry";
import { FRAMER_LIGHT_SYNTAX_THEME_NAME } from "../themes/framerLightSyntax";

export interface SyntaxTheme {
  readonly dark: string;
  readonly light: string;
}

export interface ShikiThemeEntry {
  readonly dark: string | null;
  readonly light: string | null;
}

export type ShikiThemeMap = Record<string, ShikiThemeEntry>;

export const FALLBACK_SYNTAX_THEME: SyntaxTheme = {
  dark: "github-dark",
  light: "github-light",
} as const;

/**
 * Pure mapping from Plannotator palette IDs to Shiki theme names.
 * No React, Pierre, or review-editor imports.
 */
export const SHIKI_THEME_MAP = {
  andromeeda: { dark: "andromeeda", light: null },
  "aurora-x": { dark: "aurora-x", light: null },
  "ayu-dark": { dark: "ayu-dark", light: null },
  catppuccin: { dark: "catppuccin-mocha", light: "catppuccin-latte" },
  "dark-plus": { dark: "dark-plus", light: "light-plus" },
  dracula: { dark: "dracula", light: null },
  everforest: { dark: "everforest-dark", light: "everforest-light" },
  "everforest-hard": { dark: "everforest-dark", light: "everforest-light" },
  "everforest-soft": { dark: "everforest-dark", light: "everforest-light" },
  "framer-light": { dark: FRAMER_LIGHT_SYNTAX_THEME_NAME, light: FRAMER_LIGHT_SYNTAX_THEME_NAME },
  github: { dark: "github-dark", light: "github-light" },
  gruvbox: { dark: "gruvbox-dark-medium", light: "gruvbox-light-medium" },
  houston: { dark: "houston", light: null },
  "kanagawa-dragon": { dark: "kanagawa-dragon", light: null },
  "kanagawa-lotus": { dark: null, light: "kanagawa-lotus" },
  "kanagawa-wave": { dark: "kanagawa-wave", light: null },
  laserwave: { dark: "laserwave", light: null },
  material: { dark: "material-theme", light: "material-theme-lighter" },
  min: { dark: "min-dark", light: "min-light" },
  "monokai-pro": { dark: "monokai", light: null },
  "night-owl": { dark: "night-owl", light: null },
  nord: { dark: "nord", light: null },
  "one-dark-pro": { dark: "one-dark-pro", light: null },
  "one-light": { dark: null, light: "one-light" },
  plastic: { dark: "plastic", light: null },
  poimandres: { dark: "poimandres", light: null },
  red: { dark: "red", light: null },
  "rose-pine": { dark: "rose-pine", light: "rose-pine-dawn" },
  slack: { dark: "slack-dark", light: "slack-ochin" },
  "snazzy-light": { dark: null, light: "snazzy-light" },
  solarized: { dark: "solarized-dark", light: "solarized-light" },
  "synthwave-84": { dark: "synthwave-84", light: null },
  "tokyo-night": { dark: "tokyo-night", light: null },
  vesper: { dark: "vesper", light: null },
  vitesse: { dark: "vitesse-dark", light: "vitesse-light" },
  "vitesse-black": { dark: "vitesse-black", light: null },
} satisfies ShikiThemeMap;

export function resolveSyntaxTheme(colorTheme: string, mode: "dark" | "light"): SyntaxTheme {
  const entry = SHIKI_THEME_MAP[colorTheme];
  if (!entry?.[mode]) {
    return FALLBACK_SYNTAX_THEME;
  }
  return {
    dark: entry.dark ?? FALLBACK_SYNTAX_THEME.dark,
    light: entry.light ?? FALLBACK_SYNTAX_THEME.light,
  };
}

export function resolveAppliedSyntaxTheme(
  colorTheme: string,
  resolvedMode: "dark" | "light",
): SyntaxTheme {
  const appliedMode = resolveAppliedThemeMode(colorTheme, resolvedMode);
  return resolveSyntaxTheme(colorTheme, appliedMode);
}

/**
 * Resolve the single Shiki theme to use for a given palette + mode.
 * Returns the concrete theme name string.
 */
export function resolveShikiThemeName(colorTheme: string, resolvedMode: "dark" | "light"): string {
  const appliedMode = resolveAppliedThemeMode(colorTheme, resolvedMode);
  const syntaxTheme = resolveSyntaxTheme(colorTheme, appliedMode);
  return syntaxTheme[appliedMode];
}
