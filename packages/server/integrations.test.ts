import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { extractTitle, extractTags, saveToObsidian } from "./integrations";

describe("extractTitle", () => {
  test("extracts plain H1", () => {
    expect(extractTitle("# My Plan\n\nContent")).toBe("My Plan");
  });

  test("strips Implementation Plan: prefix", () => {
    expect(extractTitle("# Implementation Plan: Auth Flow\n\nContent")).toBe("Auth Flow");
  });

  test("strips Plan: prefix", () => {
    expect(extractTitle("# Plan: Database Migration\n\nContent")).toBe("Database Migration");
  });

  test("falls back to 'Plan' when no H1", () => {
    expect(extractTitle("No heading here")).toBe("Plan");
  });

  test("truncates to 50 chars", () => {
    const long = "A".repeat(60);
    expect(extractTitle(`# ${long}`).length).toBe(50);
  });

  test("removes special characters", () => {
    expect(extractTitle("# Fix [bug] #123")).toBe("Fix bug 123");
  });
});

describe("extractTags", () => {
  test("always includes plannotator tag", async () => {
    const tags = await extractTags("# Simple Plan\n\nContent");
    expect(tags).toContain("plannotator");
  });

  test("extracts words from title", async () => {
    const tags = await extractTags("# Authentication Service Refactor\n\nContent");
    expect(tags).toContain("authentication");
    expect(tags).toContain("service");
    expect(tags).toContain("refactor");
  });

  test("filters stop words from title", async () => {
    const tags = await extractTags("# Implementation Plan for the System\n\nContent");
    expect(tags).not.toContain("implementation");
    expect(tags).not.toContain("plan");
    expect(tags).not.toContain("the");
    expect(tags).not.toContain("for");
  });

  test("extracts code fence languages", async () => {
    const tags = await extractTags("# Plan\n\n```typescript\ncode\n```\n\n```rust\ncode\n```");
    expect(tags).toContain("typescript");
    expect(tags).toContain("rust");
  });

  test("skips generic languages", async () => {
    const tags = await extractTags("# Plan\n\n```json\n{}\n```\n\n```yaml\nfoo\n```");
    expect(tags).not.toContain("json");
    expect(tags).not.toContain("yaml");
  });

  test("limits to 7 tags", async () => {
    const tags = await extractTags(
      "# One Two Three Four\n\n```go\n```\n```python\n```\n```ruby\n```\n```swift\n```",
    );
    expect(tags.length).toBeLessThanOrEqual(7);
  });
});

describe("saveToObsidian", () => {
  test("writes plan file to temp vault", async () => {
    const tmpDir = mkdtempSync("/tmp/plannotator-vault-");
    try {
      const result = await saveToObsidian({
        vaultPath: tmpDir,
        folder: "plannotator",
        plan: "# Test Plan\n\nSome content",
      });

      expect(result.success).toBe(true);
      expect(result.path).toBeString();
      expect(result.path).toContain(tmpDir);
      expect(result.path).toContain("plannotator");

      const exists = Bun.file(result.path!).size > 0;
      expect(exists).toBe(true);

      const content = await Bun.file(result.path!).text();
      expect(content).toContain("# Test Plan");
      expect(content).toContain("[[Plannotator Plans]]");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("fails when vault path does not exist", async () => {
    const result = await saveToObsidian({
      vaultPath: "/nonexistent/vault",
      folder: "plannotator",
      plan: "# Plan",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeString();
  });
});
