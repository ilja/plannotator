import { describe, expect, test } from "bun:test";
import {
  FALLBACK_SYNTAX_THEME,
  SHIKI_THEME_MAP,
  resolveAppliedSyntaxTheme,
  resolveShikiThemeName,
  resolveSyntaxTheme,
} from "./syntaxThemeRegistry";

describe("syntaxThemeRegistry", () => {
  test("maps catppuccin to mocha/latte", () => {
    expect(resolveSyntaxTheme("catppuccin", "dark")).toEqual({
      dark: "catppuccin-mocha",
      light: "catppuccin-latte",
    });
  });

  test("framer-light maps to custom theme in both modes", () => {
    expect(resolveSyntaxTheme("framer-light", "dark").dark).toBe("plannotator-framer-light");
    expect(resolveSyntaxTheme("framer-light", "light").light).toBe("plannotator-framer-light");
  });

  test("dracula has only dark", () => {
    expect(resolveSyntaxTheme("dracula", "dark").dark).toBe("dracula");
    expect(resolveSyntaxTheme("dracula", "light")).toEqual(FALLBACK_SYNTAX_THEME);
  });

  test("kanagawa-lotus has only light", () => {
    expect(resolveSyntaxTheme("kanagawa-lotus", "light").light).toBe("kanagawa-lotus");
    expect(resolveSyntaxTheme("kanagawa-lotus", "dark")).toEqual(FALLBACK_SYNTAX_THEME);
  });

  test("unknown palette falls back", () => {
    expect(resolveSyntaxTheme("unknown-palette", "dark")).toEqual(FALLBACK_SYNTAX_THEME);
    expect(resolveSyntaxTheme("unknown-palette", "light")).toEqual(FALLBACK_SYNTAX_THEME);
  });

  test("resolveAppliedSyntaxTheme respects modeSupport", () => {
    // framer-light is light-only, so dark request still returns light theme name
    expect(resolveAppliedSyntaxTheme("framer-light", "dark").light).toBe(
      "plannotator-framer-light",
    );
    // dracula is dark-only
    expect(resolveAppliedSyntaxTheme("dracula", "light").dark).toBe("dracula");
  });

  test("resolveShikiThemeName returns concrete name", () => {
    expect(resolveShikiThemeName("github", "dark")).toBe("github-dark");
    expect(resolveShikiThemeName("github", "light")).toBe("github-light");
    expect(resolveShikiThemeName("framer-light", "dark")).toBe("plannotator-framer-light");
    expect(resolveShikiThemeName("unknown", "dark")).toBe(FALLBACK_SYNTAX_THEME.dark);
  });

  test("SHIKI_THEME_MAP covers all syntaxHighlighting themes", () => {
    // ensure map has entries for known themes
    expect(SHIKI_THEME_MAP["github"]).toBeDefined();
    expect(SHIKI_THEME_MAP["andromeeda"]).toBeDefined();
  });
});
