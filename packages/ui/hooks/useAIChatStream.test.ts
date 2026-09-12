import { describe, expect, test } from "bun:test";
import { processAIChatStream, type StreamMessageHandlers } from "./useAIChat";

function handlers(): StreamMessageHandlers & { errors: string[]; messages: unknown[] } {
  const errors: string[] = [];
  const messages: unknown[] = [];

  return {
    errors,
    messages,
    questionId: "q1",
    updateMessages: (updater) => {
      messages.push(updater([]));
    },
    updatePermissions: () => {},
    setError: (error) => {
      errors.push(error);
    },
  };
}

function sseResponse(lines: string[]): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines.join("\n")));
      controller.close();
    },
  });

  return new Response(body);
}

describe("processAIChatStream", () => {
  test("a malformed result line surfaces an error instead of hanging", async () => {
    const h = handlers();

    await processAIChatStream(
      sseResponse(['data: {"type":"result","result":"orphan"}', "", "data: [DONE]", ""]),
      h,
    );

    expect(h.errors).toEqual(["AI session response was malformed"]);
  });

  test("ignored tool traffic stays silent", async () => {
    const h = handlers();

    await processAIChatStream(
      sseResponse(['data: {"type":"tool_use","toolName":"Bash"}', "", "data: [DONE]", ""]),
      h,
    );

    expect(h.errors).toEqual([]);
  });

  test("well-formed completions do not raise errors", async () => {
    const h = handlers();

    await processAIChatStream(
      sseResponse([
        'data: {"type":"text_delta","delta":"hi"}',
        "",
        'data: {"type":"result","success":true,"result":"hi"}',
        "",
        "data: [DONE]",
        "",
      ]),
      h,
    );

    expect(h.errors).toEqual([]);
    expect(h.messages.length).toBeGreaterThan(0);
  });
});
