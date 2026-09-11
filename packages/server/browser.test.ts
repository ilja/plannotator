import { afterEach, describe, expect, test } from "bun:test";
import {
  decodeVscodeIpcRegistry,
  isNoOpBrowserSentinel,
  shouldTryRemoteBrowserFallback,
} from "./browser";

const savedEnv: Record<string, string | undefined> = {};

const envKeys = ["PLANNOTATOR_BROWSER", "BROWSER"];

function clearEnv() {
  for (const key of envKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

describe("shouldTryRemoteBrowserFallback", () => {
  test("false for local sessions", () => {
    clearEnv();
    expect(shouldTryRemoteBrowserFallback(false)).toBe(false);
  });

  test("true for remote sessions without browser handlers", () => {
    clearEnv();
    expect(shouldTryRemoteBrowserFallback(true)).toBe(true);
  });

  test("false for remote sessions with BROWSER configured", () => {
    clearEnv();
    process.env.BROWSER = "/usr/bin/browser";
    expect(shouldTryRemoteBrowserFallback(true)).toBe(false);
  });

  test("false for remote sessions with PLANNOTATOR_BROWSER configured", () => {
    clearEnv();
    process.env.PLANNOTATOR_BROWSER = "/usr/bin/browser";
    expect(shouldTryRemoteBrowserFallback(true)).toBe(false);
  });

  test("true for remote sessions when BROWSER is a no-op sentinel", () => {
    clearEnv();
    process.env.BROWSER = "true";
    expect(shouldTryRemoteBrowserFallback(true)).toBe(true);
  });

  test("true for remote sessions when PLANNOTATOR_BROWSER is a no-op sentinel", () => {
    clearEnv();
    process.env.PLANNOTATOR_BROWSER = "none";
    expect(shouldTryRemoteBrowserFallback(true)).toBe(true);
  });
});

describe("decodeVscodeIpcRegistry", () => {
  test("preserves a valid registry", () => {
    expect(
      decodeVscodeIpcRegistry(
        JSON.stringify({
          "/workspace/project": 3000,
          "/workspace/other": 4000,
        }),
      ),
    ).toEqual({
      "/workspace/project": 3000,
      "/workspace/other": 4000,
    });
  });

  test("returns an empty registry for malformed JSON or a non-object root", () => {
    for (const raw of ["{", "null", "[]", "42", '"registry"']) {
      expect(decodeVscodeIpcRegistry(raw)).toEqual({});
    }
  });

  test("drops malformed entries while retaining valid siblings", () => {
    expect(
      decodeVscodeIpcRegistry(
        JSON.stringify({
          "/workspace/valid": 3000,
          "/workspace/object": { port: 4000 },
          "/workspace/null": null,
          "/workspace/array": [5000],
        }),
      ),
    ).toEqual({ "/workspace/valid": 3000 });
  });

  test("drops invalid PIDs while retaining valid siblings", () => {
    expect(
      decodeVscodeIpcRegistry(
        '{"/workspace/valid":3000,"/workspace/string":"4000","/workspace/fractional":4000.5,"/workspace/nonfinite":1e400,"/workspace/zero":0,"/workspace/negative":-1}',
      ),
    ).toEqual({ "/workspace/valid": 3000 });
  });
});

describe("isNoOpBrowserSentinel", () => {
  test("returns false for undefined and empty values", () => {
    expect(isNoOpBrowserSentinel(undefined)).toBe(false);
    expect(isNoOpBrowserSentinel("")).toBe(false);
  });

  test("recognizes no-op values case- and whitespace-insensitively", () => {
    for (const value of ["true", "false", "none", ":", "0", "1", "TRUE", "  none  "]) {
      expect(isNoOpBrowserSentinel(value)).toBe(true);
    }
  });

  test("does not flag real browser handlers or explicit command paths", () => {
    expect(isNoOpBrowserSentinel("/usr/bin/firefox")).toBe(false);
    expect(isNoOpBrowserSentinel("Google Chrome")).toBe(false);
    expect(isNoOpBrowserSentinel("open")).toBe(false);
    expect(isNoOpBrowserSentinel("/usr/bin/true")).toBe(false);
  });
});
