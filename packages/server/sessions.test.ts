import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { decodeSessionInfo, listSessions, type SessionInfo } from "./sessions";

const validSession: SessionInfo = {
  pid: process.pid,
  port: 3000,
  url: "http://localhost:3000/plannotator-review",
  mode: "review",
  project: "/workspace/plannotator",
  startedAt: "2026-03-12T10:00:00.000Z",
  label: "Plannotator",
};

const originalDataDir = process.env.PLANNOTATOR_DATA_DIR;

const temporaryDataDirs: string[] = [];

afterEach(() => {
  if (originalDataDir === undefined) {
    delete process.env.PLANNOTATOR_DATA_DIR;
  } else {
    process.env.PLANNOTATOR_DATA_DIR = originalDataDir;
  }

  for (const dataDir of temporaryDataDirs.splice(0)) {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

function useTemporaryDataDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "plannotator-sessions-"));
  temporaryDataDirs.push(dataDir);
  process.env.PLANNOTATOR_DATA_DIR = dataDir;

  return dataDir;
}

describe("decodeSessionInfo", () => {
  test("accepts a complete valid session", () => {
    expect(decodeSessionInfo(validSession)).toEqual(validSession);
  });

  test("rejects non-object session data", () => {
    for (const input of [null, "session", []]) {
      expect(() => decodeSessionInfo(input)).toThrow();
    }
  });

  test("rejects records missing each required field", () => {
    const incompleteSessions = [
      {
        port: 3000,
        url: "http://localhost:3000",
        mode: "review",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        url: "http://localhost:3000",
        mode: "review",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        mode: "review",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        url: "http://localhost:3000",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        url: "http://localhost:3000",
        mode: "review",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        url: "http://localhost:3000",
        mode: "review",
        project: "/workspace",
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        url: "http://localhost:3000",
        mode: "review",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
      },
    ];

    for (const input of incompleteSessions) {
      expect(() => decodeSessionInfo(input)).toThrow();
    }
  });

  test("rejects records with wrong required field values", () => {
    const malformedSessions = [
      {
        pid: "1",
        port: 3000,
        url: "http://localhost:3000",
        mode: "review",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        port: "3000",
        url: "http://localhost:3000",
        mode: "review",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        url: 123,
        mode: "review",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        url: "http://localhost:3000",
        mode: "other",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        url: "http://localhost:3000",
        mode: "review",
        project: 123,
        startedAt: "2026-03-12T10:00:00.000Z",
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        url: "http://localhost:3000",
        mode: "review",
        project: "/workspace",
        startedAt: 123,
        label: "Session",
      },
      {
        pid: 1,
        port: 3000,
        url: "http://localhost:3000",
        mode: "review",
        project: "/workspace",
        startedAt: "2026-03-12T10:00:00.000Z",
        label: 123,
      },
    ];

    for (const input of malformedSessions) {
      expect(() => decodeSessionInfo(input)).toThrow();
    }
  });

  test("rejects invalid pid values", () => {
    for (const pid of [
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
    ]) {
      expect(() =>
        decodeSessionInfo({
          pid,
          port: 3000,
          url: "http://localhost:3000",
          mode: "review",
          project: "/workspace",
          startedAt: "2026-03-12T10:00:00.000Z",
          label: "Session",
        }),
      ).toThrow();
    }
  });

  test("rejects invalid port values", () => {
    for (const port of [
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
    ]) {
      expect(() =>
        decodeSessionInfo({
          pid: 1,
          port,
          url: "http://localhost:3000",
          mode: "review",
          project: "/workspace",
          startedAt: "2026-03-12T10:00:00.000Z",
          label: "Session",
        }),
      ).toThrow();
    }
  });
});

describe("listSessions", () => {
  test("removes malformed JSON and schema-invalid session files", () => {
    const dataDir = useTemporaryDataDir();
    const sessionsDir = join(dataDir, "sessions");
    const malformedJsonPath = join(sessionsDir, "malformed-json.json");
    const invalidSessionPath = join(sessionsDir, "invalid-session.json");
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(malformedJsonPath, "{", "utf-8");
    writeFileSync(invalidSessionPath, JSON.stringify({ pid: 1 }), "utf-8");

    expect(listSessions()).toEqual([]);
    expect(existsSync(malformedJsonPath)).toBe(false);
    expect(existsSync(invalidSessionPath)).toBe(false);
  });
});
