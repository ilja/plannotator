import { describe, expect, test } from "bun:test";
import {
  decodeAIChatError,
  decodeAIChatSessionId,
  decodeAIChatStreamMessage,
  isMalformedResultPayload,
} from "./aiChatStreamMessages";

describe("decodeAIChatStreamMessage", () => {
  test("decodes every stream event used by the chat UI", () => {
    expect(decodeAIChatStreamMessage({ type: "text_delta", delta: "Hello" })).toEqual({
      type: "text_delta",
      delta: "Hello",
    });
    expect(decodeAIChatStreamMessage({ type: "text", text: "Hello" })).toEqual({
      type: "text",
      text: "Hello",
    });
    expect(decodeAIChatStreamMessage({ type: "error", error: "Unavailable" })).toEqual({
      type: "error",
      error: "Unavailable",
    });
    expect(
      decodeAIChatStreamMessage({ type: "result", success: true, result: "Complete" }),
    ).toEqual({
      type: "result",
      success: true,
      result: "Complete",
    });
    expect(decodeAIChatStreamMessage({ type: "result", success: true })).toEqual({
      type: "result",
      success: true,
    });
    expect(decodeAIChatStreamMessage({ type: "result", result: "Complete" })).toBeNull();
    expect(
      decodeAIChatStreamMessage({
        type: "permission_request",
        requestId: "request-1",
        toolName: "Bash",
        toolInput: { command: "pwd", options: ["-P"] },
        title: "Run command",
        displayName: "Terminal",
        description: "Reads the current directory",
        toolUseId: "tool-1",
      }),
    ).toEqual({
      type: "permission_request",
      requestId: "request-1",
      toolName: "Bash",
      toolInput: { command: "pwd", options: ["-P"] },
      title: "Run command",
      displayName: "Terminal",
      description: "Reads the current directory",
      toolUseId: "tool-1",
    });
  });

  test("isMalformedResultPayload flags only undecodable results", () => {
    expect(isMalformedResultPayload({ type: "result", result: "orphan" })).toBe(true);
    expect(isMalformedResultPayload({ type: "result", success: true })).toBe(false);
    expect(isMalformedResultPayload({ type: "tool_use", toolName: "Bash" })).toBe(false);
    expect(isMalformedResultPayload(null)).toBe(false);
  });

  test("decodes session identifiers and API error messages", () => {
    expect(decodeAIChatSessionId({ sessionId: "session-1" })).toBe("session-1");
    expect(decodeAIChatSessionId({ sessionId: 1 })).toBeNull();
    expect(decodeAIChatError({ error: "Unavailable" })).toBe("Unavailable");
    expect(decodeAIChatError({ error: 503 })).toBeNull();
  });

  test("rejects unknown variants and malformed nested permission requests", () => {
    expect(decodeAIChatStreamMessage({ type: "tool_use", toolName: "Bash" })).toBeNull();
    expect(decodeAIChatStreamMessage({ type: "text_delta", delta: 1 })).toBeNull();
    expect(
      decodeAIChatStreamMessage({
        type: "permission_request",
        requestId: "request-1",
        toolName: "Bash",
        toolInput: ["not", "an", "object"],
        toolUseId: "tool-1",
      }),
    ).toBeNull();
    expect(
      decodeAIChatStreamMessage({
        type: "permission_request",
        requestId: "request-1",
        toolName: "Bash",
        toolInput: { command: () => {} },
        toolUseId: "tool-1",
      }),
    ).toBeNull();
  });
});
