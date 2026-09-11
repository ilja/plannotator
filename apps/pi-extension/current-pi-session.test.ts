import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  registerCurrentPiSession,
  sendUserMessageToCurrentPiSession,
  withCurrentPiSessionFallbackHeader,
} from "./current-pi-session";

type SendUserMessageContent = Parameters<ExtensionAPI["sendUserMessage"]>[0];

type SendUserMessageOptions = Parameters<ExtensionAPI["sendUserMessage"]>[1];

function fakeApi(
  sendUserMessage: (content: SendUserMessageContent, options?: SendUserMessageOptions) => void,
): ExtensionAPI {
  const partial: Partial<ExtensionAPI> = { sendUserMessage };

  // SAFETY: test double covering only the sendUserMessage surface that
  // current-pi-session.ts touches; ExtensionAPI has many other members.
  return partial as ExtensionAPI;
}

describe("withCurrentPiSessionFallbackHeader", () => {
  test("prepends the fallback header to string content", () => {
    const out = withCurrentPiSessionFallbackHeader("hello");

    expect(out).toContain("no longer active");
    expect(out.endsWith("hello")).toBe(true);
  });

  test("passes array content through unchanged", () => {
    const blocks = [{ type: "text", text: "hi" }];

    expect(withCurrentPiSessionFallbackHeader(blocks)).toBe(blocks);
  });
});

describe("sendUserMessageToCurrentPiSession", () => {
  test("returns ok and forwards string content to the current session", () => {
    const sent: unknown[] = [];

    const registration = registerCurrentPiSession(
      fakeApi((content) => {
        sent.push(content);
      }),
    );

    const result = sendUserMessageToCurrentPiSession("hello");

    expect(result).toEqual({ ok: true });
    expect(sent).toEqual(["hello"]);
    registration.clear();
  });

  test("returns no-current when no session is registered", () => {
    const result = sendUserMessageToCurrentPiSession("hello");

    expect(result).toEqual({
      ok: false,
      reason: "no-current",
      error: new Error("No active Pi session is available."),
    });
  });

  test("reports send-failed with the thrown Error", () => {
    const registration = registerCurrentPiSession(
      fakeApi(() => {
        throw new Error("boom");
      }),
    );

    const result = sendUserMessageToCurrentPiSession("hello");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe("send-failed");
      expect(result.error instanceof Error).toBe(true);
      expect(result.error instanceof Error && result.error.message).toBe("boom");
    }

    registration.clear();
  });

  test("wraps non-Error throws into an Error result", () => {
    const registration = registerCurrentPiSession(
      fakeApi(() => {
        throw "string boom";
      }),
    );

    const result = sendUserMessageToCurrentPiSession("hello");

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe("send-failed");
      expect(result.error instanceof Error).toBe(true);
      expect(result.error instanceof Error && result.error.message).toBe("string boom");
    }

    registration.clear();
  });
});
