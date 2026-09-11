import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { decodePasteFile, FsPasteStore } from "./fs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }

  temporaryDirectories.length = 0;
});

function createDataDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "plannotator-pastes-"));
  temporaryDirectories.push(directory);

  return directory;
}

function writePasteFile(directory: string, name: string, contents: string): string {
  const path = join(directory, name);
  writeFileSync(path, contents, "utf-8");

  return path;
}

describe("decodePasteFile", () => {
  test("accepts all finite numeric expiry timestamps", () => {
    for (const expiresAt of [-1, 0, 1.5, Number.MAX_VALUE]) {
      expect(decodePasteFile(JSON.stringify({ data: "hello", expiresAt }))).toEqual({
        data: "hello",
        expiresAt,
      });
    }
  });

  test("rejects malformed JSON and JSON values that are not objects", () => {
    expect(() => decodePasteFile("not json")).toThrow();
    expect(() => decodePasteFile("[]")).toThrow();
    expect(() => decodePasteFile("null")).toThrow();
  });

  test("rejects missing or incorrectly typed persisted fields", () => {
    for (const contents of [
      "{}",
      '{"expiresAt":1}',
      '{"data":"hello"}',
      '{"data":1,"expiresAt":1}',
      '{"data":"hello","expiresAt":"1"}',
    ]) {
      expect(() => decodePasteFile(contents)).toThrow();
    }
  });

  test("rejects non-finite expiry metadata", () => {
    for (const contents of [
      '{"data":"hello","expiresAt":1e400}',
      '{"data":"hello","expiresAt":-1e400}',
    ]) {
      expect(() => decodePasteFile(contents)).toThrow();
    }
  });
});

describe("FsPasteStore", () => {
  test("returns null for missing and malformed pastes without deleting malformed files", async () => {
    const directory = createDataDirectory();
    const store = new FsPasteStore(directory);
    const malformedPath = writePasteFile(directory, "malformed.json", "not json");

    await expect(store.get("missing")).resolves.toBeNull();
    await expect(store.get("malformed")).resolves.toBeNull();
    expect(existsSync(malformedPath)).toBe(true);
  });

  test("deletes a paste with a negative fractional expiry timestamp when it is read", async () => {
    const directory = createDataDirectory();
    const store = new FsPasteStore(directory);

    const expiredPath = writePasteFile(
      directory,
      "expired.json",
      JSON.stringify({ data: "expired", expiresAt: -0.5 }),
    );

    await expect(store.get("expired")).resolves.toBeNull();
    expect(existsSync(expiredPath)).toBe(false);
  });

  test("sweeps expired finite timestamps and preserves fresh and corrupt siblings", () => {
    const directory = createDataDirectory();

    const negativePath = writePasteFile(
      directory,
      "negative.json",
      JSON.stringify({ data: "negative", expiresAt: -1 }),
    );

    const zeroPath = writePasteFile(
      directory,
      "zero.json",
      JSON.stringify({ data: "zero", expiresAt: 0 }),
    );

    const fractionalPath = writePasteFile(
      directory,
      "fractional.json",
      JSON.stringify({ data: "fractional", expiresAt: 0.5 }),
    );

    const freshPath = writePasteFile(
      directory,
      "fresh.json",
      JSON.stringify({ data: "fresh", expiresAt: Date.now() + 60_000 }),
    );

    const corruptPath = writePasteFile(directory, "corrupt.json", "not json");

    new FsPasteStore(directory);

    expect(existsSync(negativePath)).toBe(false);
    expect(existsSync(zeroPath)).toBe(false);
    expect(existsSync(fractionalPath)).toBe(false);
    expect(existsSync(freshPath)).toBe(true);
    expect(existsSync(corruptPath)).toBe(true);
  });
});
