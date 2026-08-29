import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  parseAICapabilitiesResponse,
  parsePlanResponse,
  parseSaveNotesResponse,
  parseShareHtmlResponse,
} from "./app-boundaries";

describe("editor presentation boundaries", () => {
  test("delegates dialogs and overlays to dedicated components", () => {
    const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(appSource).toContain('from "./components/EditorDialogs";');
    expect(appSource).toContain('from "./components/EditorOverlays";');
    expect(appSource).toContain("<EditorDialogs");
    expect(appSource).toContain("<EditorOverlays");
    expect(appSource).not.toContain("<ExportModal");
    expect(appSource).not.toContain("<ImportModal");
    expect(appSource).not.toContain("<ConfirmDialog");
    expect(appSource).not.toContain("<CodeFilePopout");
    expect(appSource).not.toContain("<CompletionOverlay");
    expect(appSource).not.toContain("<LookAndFeelAnnouncementDialog");
    expect(appSource).not.toContain("<ImageAnnotator");
  });
});

describe("editor API boundary parsers", () => {
  test("parses a plan response with source metadata", () => {
    const plan = parsePlanResponse({
      plan: "# Plan",
      mode: "annotate",
      origin: "pi",
      sourceSave: { enabled: false, reason: "not-local-file" },
      recentMessages: [{ messageId: "message-1", text: "Recent message" }],
    });

    expect(plan.plan).toBe("# Plan");
    expect(plan.sourceSave?.enabled).toBe(false);
    expect(plan.recentMessages?.[0]?.messageId).toBe("message-1");
  });

  test("accepts an omitted plan from the development API", () => {
    expect(parsePlanResponse({ origin: "claude-code", sharingEnabled: true }).plan).toBeUndefined();
  });

  test("rejects malformed plan and share responses", () => {
    expect(() => parsePlanResponse({ plan: 42 })).toThrow();
    expect(() => parseShareHtmlResponse({ shareHtml: 42 })).toThrow();
  });

  test("preserves an empty share-html payload", () => {
    expect(parseShareHtmlResponse({ shareHtml: "" }).shareHtml).toBe("");
  });

  test("parses unavailable AI capabilities", () => {
    expect(
      parseAICapabilitiesResponse({
        available: false,
        providers: [],
        defaultProvider: null,
      }),
    ).toMatchObject({ available: false, defaultProvider: null });
  });

  test("parses AI capabilities and rejects malformed provider fields", () => {
    const capabilities = parseAICapabilitiesResponse({
      available: true,
      defaultProvider: "pi-sdk",
      providers: [
        {
          id: "pi-sdk",
          name: "pi-sdk",
          capabilities: { fork: false, resume: false, streaming: true, tools: true },
          models: [{ id: "provider/model", label: "Model", default: true }],
        },
      ],
    });

    expect(capabilities.defaultProvider).toBe("pi-sdk");
    expect(capabilities.providers[0]?.models[0]?.id).toBe("provider/model");
    expect(() =>
      parseAICapabilitiesResponse({
        available: true,
        defaultProvider: 42,
        providers: [],
      }),
    ).toThrow();
  });

  test("parses save-notes results and rejects malformed success flags", () => {
    const response = parseSaveNotesResponse({
      results: {
        obsidian: { success: true, path: "/tmp/plan.md" },
      },
    });

    expect(response.results?.obsidian?.success).toBe(true);
    expect(() =>
      parseSaveNotesResponse({
        results: { obsidian: { success: "yes" } },
      }),
    ).toThrow();
  });
});
