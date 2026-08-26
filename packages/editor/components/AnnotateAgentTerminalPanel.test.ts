import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DISPLAY_SETTINGS,
  normalizeTerminalDimension,
  sanitizeDisplaySettings,
} from "./AnnotateAgentTerminalPanel";

describe("normalizeTerminalDimension", () => {
  const cases: Array<[number | undefined, number | undefined]> = [
    [1, 1],
    [1000, 1000],
    [1001, 1000],
    [120, 120],
    [0, undefined],
    [-5, undefined],
    [2.5, undefined],
    [NaN, undefined],
    [undefined, undefined],
  ];

  for (const [input, expected] of cases) {
    test(`maps ${String(input)} to ${String(expected)}`, () => {
      expect(normalizeTerminalDimension(input)).toBe(expected);
    });
  }
});

describe("sanitizeDisplaySettings", () => {
  test("keeps a valid record", () => {
    expect(
      sanitizeDisplaySettings({
        fontFamily: "system",
        fontSize: 16,
        fontWeight: "medium",
        lineHeight: 1.1,
      }),
    ).toEqual({
      fontFamily: "system",
      fontSize: 16,
      fontWeight: "medium",
      lineHeight: 1.1,
    });
  });

  test("falls back per field when a field is wrong-typed, preserving the others", () => {
    expect(
      sanitizeDisplaySettings({
        fontFamily: "theme",
        fontSize: "huge",
        fontWeight: "light",
        lineHeight: 1.2,
      }),
    ).toEqual({
      fontFamily: "theme",
      fontSize: DEFAULT_DISPLAY_SETTINGS.fontSize,
      fontWeight: "light",
      lineHeight: 1.2,
    });
  });

  test("falls back per field for unknown option values", () => {
    expect(
      sanitizeDisplaySettings({
        fontFamily: "comic-sans",
        fontWeight: "bold",
      }),
    ).toEqual({
      fontFamily: DEFAULT_DISPLAY_SETTINGS.fontFamily,
      fontSize: DEFAULT_DISPLAY_SETTINGS.fontSize,
      fontWeight: DEFAULT_DISPLAY_SETTINGS.fontWeight,
      lineHeight: DEFAULT_DISPLAY_SETTINGS.lineHeight,
    });
  });

  test("falls back when lineHeight is not a listed option", () => {
    expect(sanitizeDisplaySettings({ lineHeight: 1.5 })).toEqual({
      fontFamily: DEFAULT_DISPLAY_SETTINGS.fontFamily,
      fontSize: DEFAULT_DISPLAY_SETTINGS.fontSize,
      fontWeight: DEFAULT_DISPLAY_SETTINGS.fontWeight,
      lineHeight: DEFAULT_DISPLAY_SETTINGS.lineHeight,
    });
  });

  test("clamps out-of-range font sizes", () => {
    expect(sanitizeDisplaySettings({ fontSize: 40 })).toEqual({
      fontFamily: DEFAULT_DISPLAY_SETTINGS.fontFamily,
      fontSize: 24,
      fontWeight: DEFAULT_DISPLAY_SETTINGS.fontWeight,
      lineHeight: DEFAULT_DISPLAY_SETTINGS.lineHeight,
    });
    expect(sanitizeDisplaySettings({ fontSize: 4 })).toEqual({
      fontFamily: DEFAULT_DISPLAY_SETTINGS.fontFamily,
      fontSize: 10,
      fontWeight: DEFAULT_DISPLAY_SETTINGS.fontWeight,
      lineHeight: DEFAULT_DISPLAY_SETTINGS.lineHeight,
    });
  });

  test("returns all defaults for an empty record", () => {
    expect(sanitizeDisplaySettings({})).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });
});
