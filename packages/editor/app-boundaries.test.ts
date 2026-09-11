import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  parseAICapabilitiesResponse,
  parsePlanResponse,
  parseSaveNotesResponse,
  parseShareHtmlResponse,
} from "./app-boundaries";

describe("editor presentation boundaries", () => {
  test("delegates the editor screen to a dedicated component", () => {
    const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    const screenSource = readFileSync(
      new URL("./components/EditorAppScreen.tsx", import.meta.url),
      "utf8",
    );

    expect(appSource).toContain('from "./components/EditorAppScreen";');
    expect(appSource).toContain("<EditorAppScreen");
    expect(appSource).not.toContain("<ThemeProvider");
    expect(appSource).not.toContain("<TooltipProvider");
    expect(appSource).not.toContain("<AppHeader");
    expect(appSource).not.toContain("<WorkspaceBanners");
    expect(appSource).not.toContain("<EditorWorkspace");
    expect(appSource).not.toContain("<EditorDialogs");
    expect(appSource).not.toContain("<EditorOverlays");
    expect(appSource).not.toContain("<Toaster");

    expect(screenSource).toContain("<ThemeProvider");
    expect(screenSource).toContain("<TooltipProvider");
    expect(screenSource).toContain("<AppHeader");
    expect(screenSource).toContain("<WorkspaceBanners");
    expect(screenSource).toContain("<EditorWorkspace");
    expect(screenSource).toContain("<EditorDialogs");
    expect(screenSource).toContain("<EditorOverlays");
    expect(screenSource).toContain("<Toaster");
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
