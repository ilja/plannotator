import { describe, expect, test } from "bun:test";

import {
  decodeLinkedDocErrorResponse,
  decodeLinkedDocResponse,
} from "./linkedDocResponse";

const enabledSourceSave = {
  enabled: true,
  kind: "local-text-file",
  scope: "single-file",
  path: "/repo/docs/guide.md",
  basename: "guide.md",
  language: "markdown",
  hash: "sha256:guide",
  mtimeMs: 1000,
  size: 6,
  eol: "lf",
} as const;

describe("decodeLinkedDocResponse", () => {
  test("decodes a markdown response and its source-save capability", () => {
    expect(decodeLinkedDocResponse({
      filepath: "/repo/docs/guide.md",
      markdown: "# Guide",
      renderAs: "markdown",
      isConverted: false,
      sourceSave: enabledSourceSave,
    })).toEqual({
      filepath: "/repo/docs/guide.md",
      markdown: "# Guide",
      renderAs: "markdown",
      isConverted: false,
      sourceSave: enabledSourceSave,
    });
  });

  test("decodes an HTML response with raw and share HTML", () => {
    expect(decodeLinkedDocResponse({
      filepath: "/repo/docs/guide.html",
      rawHtml: "<h1>Guide</h1>",
      shareHtml: "<article><h1>Guide</h1></article>",
      renderAs: "html",
      isConverted: false,
    })).toEqual({
      filepath: "/repo/docs/guide.html",
      rawHtml: "<h1>Guide</h1>",
      shareHtml: "<article><h1>Guide</h1></article>",
      renderAs: "html",
      isConverted: false,
    });
  });

  test("decodes a disabled source-save capability", () => {
    expect(decodeLinkedDocResponse({
      filepath: "/repo/docs/guide.txt",
      markdown: "guide",
      sourceSave: { enabled: false, reason: "unsupported-extension" },
    })?.sourceSave).toEqual({
      enabled: false,
      reason: "unsupported-extension",
    });
  });

  test("rejects malformed roots and required filepath values", () => {
    expect(decodeLinkedDocResponse(null)).toBeUndefined();
    expect(decodeLinkedDocResponse({})).toBeUndefined();
    expect(decodeLinkedDocResponse({ filepath: 42, markdown: "guide" })).toBeUndefined();
    expect(decodeLinkedDocResponse({ filepath: undefined })).toBeUndefined();
  });

  test("drops malformed optional fields while retaining valid siblings", () => {
    expect(decodeLinkedDocResponse({
      filepath: "/repo/docs/guide.md",
      markdown: "guide",
      rawHtml: 42,
      shareHtml: "shared",
      renderAs: "invalid",
      isConverted: "false",
      sourceSave: { enabled: true, path: 42 },
    })).toEqual({
      filepath: "/repo/docs/guide.md",
      markdown: "guide",
      shareHtml: "shared",
    });
  });
});

describe("decodeLinkedDocErrorResponse", () => {
  test("accepts only a string error", () => {
    expect(decodeLinkedDocErrorResponse({ error: "File not found" })).toBe("File not found");
    expect(decodeLinkedDocErrorResponse({ error: 42 })).toBeUndefined();
    expect(decodeLinkedDocErrorResponse({})).toBeUndefined();
    expect(decodeLinkedDocErrorResponse(null)).toBeUndefined();
  });
});
