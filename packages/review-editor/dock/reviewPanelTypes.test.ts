import { describe, expect, it } from "bun:test";
import { getReviewDiffPanelFilePath } from "./reviewPanelTypes";

describe("getReviewDiffPanelFilePath", () => {
  it("extracts a string filePath from params", () => {
    expect(getReviewDiffPanelFilePath({ filePath: "src/app.ts" })).toBe("src/app.ts");
  });

  it("returns null when params are absent", () => {
    expect(getReviewDiffPanelFilePath(undefined)).toBeNull();
  });
});
