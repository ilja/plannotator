import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { storage } from "./storage";
import { getDefaultNotesApp, saveDefaultNotesApp } from "./defaultNotesApp";

const storedValues = new Map<string, string>();
const realStorageMethods = {
  getItem: storage.getItem,
  setItem: storage.setItem,
  removeItem: storage.removeItem,
};
const STORAGE_KEY = "plannotator-default-notes-app";

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

describe("getDefaultNotesApp", () => {
  test("accepts every supported notes app value", () => {
    for (const app of ["obsidian", "download", "ask"] as const) {
      storedValues.set(STORAGE_KEY, app);
      expect(getDefaultNotesApp()).toBe(app);
    }
  });

  test("falls back to ask for missing, empty, and invalid values without rewriting storage", () => {
    expect(getDefaultNotesApp()).toBe("ask");

    for (const value of ["", "not-a-notes-app", "true"]) {
      storedValues.set(STORAGE_KEY, value);
      expect(getDefaultNotesApp()).toBe("ask");
      expect(storedValues.get(STORAGE_KEY)).toBe(value);
    }
  });

  test("migrates removed persisted notes apps to ask", () => {
    for (const value of ["bear", "octarine"]) {
      storedValues.set(STORAGE_KEY, value);

      expect(getDefaultNotesApp()).toBe("ask");
    }
  });
});

describe("saveDefaultNotesApp", () => {
  test("persists a supported value", () => {
    saveDefaultNotesApp("download");

    expect(storedValues.get(STORAGE_KEY)).toBe("download");
  });
});
