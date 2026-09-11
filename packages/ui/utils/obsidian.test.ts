import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getObsidianSettings, saveObsidianSettings } from "./obsidian";
import { storage } from "./storage";

const STORAGE_KEY = "plannotator-obsidian-filename-separator";

const storedValues = new Map<string, string>();

const realStorageMethods = {
  getItem: storage.getItem,
  setItem: storage.setItem,
  removeItem: storage.removeItem,
};

beforeEach(() => {
  storage.getItem = (key) => storedValues.get(key) ?? null;
  storage.setItem = (key, value) => {
    storedValues.set(key, value);
  };

  storage.removeItem = (key) => {
    storedValues.delete(key);
  };
});

afterEach(() => {
  storedValues.clear();
  storage.getItem = realStorageMethods.getItem;
  storage.setItem = realStorageMethods.setItem;
  storage.removeItem = realStorageMethods.removeItem;
});

describe("getObsidianSettings filename separator", () => {
  test("accepts every supported separator", () => {
    for (const separator of ["space", "dash", "underscore"] as const) {
      storedValues.set(STORAGE_KEY, separator);
      expect(getObsidianSettings().filenameSeparator).toBe(separator);
    }
  });

  test("falls back to space for missing, empty, and invalid values without rewriting storage", () => {
    expect(getObsidianSettings().filenameSeparator).toBe("space");

    for (const value of ["", "dot", "true"]) {
      storedValues.set(STORAGE_KEY, value);
      expect(getObsidianSettings().filenameSeparator).toBe("space");
      expect(storedValues.get(STORAGE_KEY)).toBe(value);
    }
  });
});

describe("saveObsidianSettings filename separator", () => {
  test("persists a supported separator", () => {
    saveObsidianSettings({
      enabled: false,
      vaultPath: "",
      folder: "plannotator",
      filenameSeparator: "underscore",
      autoSave: false,
      vaultBrowserEnabled: false,
    });

    expect(storedValues.get(STORAGE_KEY)).toBe("underscore");
  });
});
