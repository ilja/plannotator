import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildBearQuickSavePayload, getBearSettings, normalizeTags, saveBearSettings } from "./bear";
import { storage } from "./storage";

const STORAGE_KEY = "plannotator-bear-tag-position";
const storedValues = new Map<string, string>();
const realStorageMethods = {
  getItem: storage.getItem,
  setItem: storage.setItem,
  removeItem: storage.removeItem,
};

beforeEach(() => {
  storage.getItem = (key) => storedValues.get(key) ?? null;
  storage.setItem = (key, value) => { storedValues.set(key, value); };
  storage.removeItem = (key) => { storedValues.delete(key); };
});

afterEach(() => {
  storedValues.clear();
  storage.getItem = realStorageMethods.getItem;
  storage.setItem = realStorageMethods.setItem;
  storage.removeItem = realStorageMethods.removeItem;
});

describe("normalizeTags", () => {
  test("basic comma-separated tags", () => {
    expect(normalizeTags("plan, work")).toBe("plan, work");
  });

  test("strips # prefix", () => {
    expect(normalizeTags("#plan, ##work")).toBe("plan, work");
  });

  test("lowercases", () => {
    expect(normalizeTags("Plan, WORK")).toBe("plan, work");
  });

  test("replaces spaces with hyphens", () => {
    expect(normalizeTags("my plan, some work")).toBe("my-plan, some-work");
  });

  test("preserves slashes for Bear nested tags", () => {
    expect(normalizeTags("plannotator/plans")).toBe("plannotator/plans");
  });

  test("preserves deep nested tags", () => {
    expect(normalizeTags("work/projects/frontend")).toBe("work/projects/frontend");
  });

  test("mixed nested and flat tags", () => {
    expect(normalizeTags("plannotator/plans, work, code/review")).toBe("plannotator/plans, work, code/review");
  });

  test("collapses consecutive slashes", () => {
    expect(normalizeTags("work//plans")).toBe("work/plans");
  });

  test("strips leading/trailing slashes", () => {
    expect(normalizeTags("/work/plans/")).toBe("work/plans");
  });

  test("filters empty segments", () => {
    expect(normalizeTags(",, plan")).toBe("plan");
  });
});

describe("getBearSettings tag position", () => {
  test("accepts every supported tag position", () => {
    for (const tagPosition of ["prepend", "append"] as const) {
      storedValues.set(STORAGE_KEY, tagPosition);
      expect(getBearSettings().tagPosition).toBe(tagPosition);
    }
  });

  test("falls back to append for missing, empty, and invalid values without rewriting storage", () => {
    expect(getBearSettings().tagPosition).toBe("append");

    for (const value of ["", "inline", "true"]) {
      storedValues.set(STORAGE_KEY, value);
      expect(getBearSettings().tagPosition).toBe("append");
      expect(storedValues.get(STORAGE_KEY)).toBe(value);
    }
  });
});

describe("saveBearSettings tag position", () => {
  test("persists a supported tag position", () => {
    saveBearSettings({ enabled: false, customTags: "", tagPosition: "prepend", autoSave: false });

    expect(storedValues.get(STORAGE_KEY)).toBe("prepend");
  });

  test("keeps malformed storage out of the quick-save payload", () => {
    storedValues.set(STORAGE_KEY, "not-a-position");

    expect(buildBearQuickSavePayload("Plan", getBearSettings())).toEqual({
      plan: "Plan",
      customTags: "",
      tagPosition: "append",
    });
    expect(storedValues.get(STORAGE_KEY)).toBe("not-a-position");
  });
});
