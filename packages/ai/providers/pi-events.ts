/**
 * Pi event mapping — shared between Bun and Node.js Pi providers.
 *
 * Pure function, no runtime-specific dependencies beyond the protocol schema.
 */

import { Option, Schema } from "effect";
import type { AIJsonObject, AIMessage } from "../types.ts";

const ToolCallSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  arguments: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
});

const AssistantMessageEventSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("text_delta"),
    delta: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("toolcall_end"),
    toolCall: Schema.optionalKey(ToolCallSchema),
  }),
  Schema.Struct({
    type: Schema.Literal("error"),
    error: Schema.optionalKey(
      Schema.Struct({
        errorMessage: Schema.optionalKey(Schema.String),
      }),
    ),
  }),
]);

const PiEventSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("message_update"),
    assistantMessageEvent: Schema.optionalKey(AssistantMessageEventSchema),
  }),
  Schema.Struct({
    type: Schema.Literal("tool_execution_end"),
    toolCallId: Schema.String,
    result: Schema.optionalKey(Schema.Json),
    isError: Schema.Boolean,
  }),
  Schema.Struct({ type: Schema.Literal("agent_end") }),
  Schema.Struct({ type: Schema.Literal("process_exited") }),
]);

type PiEvent = Schema.Schema.Type<typeof PiEventSchema>;

/**
 * Map a decoded Pi AgentEvent (received as JSONL) to AIMessage[].
 * Unknown and malformed events are ignored.
 */
export function mapPiEvent(event: AIJsonObject, sessionId: string): AIMessage[] {
  const parsed: PiEvent | undefined = Option.getOrUndefined(
    Schema.decodeUnknownOption(PiEventSchema)(event),
  );

  if (!parsed) return [];

  switch (parsed.type) {
    case "message_update": {
      const assistantMessageEvent = parsed.assistantMessageEvent;

      if (!assistantMessageEvent) return [];

      switch (assistantMessageEvent.type) {
        case "text_delta":
          return [{ type: "text_delta", delta: assistantMessageEvent.delta }];

        case "toolcall_end": {
          const toolCall = assistantMessageEvent.toolCall;

          if (!toolCall) return [];

          return [
            {
              type: "tool_use",
              toolName: toolCall.name,
              toolInput: toolCall.arguments ?? {},
              toolUseId: toolCall.id,
            },
          ];
        }

        case "error":
          return [
            {
              type: "error",
              error: assistantMessageEvent.error?.errorMessage ?? "Stream error",
              code: "pi_stream_error",
            },
          ];
      }
    }

    case "tool_execution_end": {
      const stringResult = Option.getOrUndefined(
        Schema.decodeUnknownOption(Schema.String)(parsed.result),
      );

      const resultStr =
        parsed.result == null ? "" : (stringResult ?? JSON.stringify(parsed.result));

      return [
        {
          type: "tool_result",
          toolUseId: parsed.toolCallId,
          result: parsed.isError ? `[Error] ${resultStr || "Tool execution failed"}` : resultStr,
        },
      ];
    }

    case "agent_end":
      return [
        {
          type: "result",
          sessionId,
          success: true,
        },
      ];

    case "process_exited":
      return [
        {
          type: "error",
          error: "Pi process exited unexpectedly.",
          code: "pi_process_exit",
        },
      ];
  }
}
