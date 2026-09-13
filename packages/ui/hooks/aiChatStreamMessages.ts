import { Option, Schema } from "effect";

const AIJsonObjectSchema = Schema.Record(Schema.String, Schema.Json);

const AIChatSessionSchema = Schema.Struct({
  sessionId: Schema.String,
});

/**
 * Transport error shape. `code` is absent: decoding a strict code union
 * would drop the message when the server adds a future code.
 */
const AIChatErrorSchema = Schema.Struct({
  error: Schema.String,
});

const AIChatStreamMessageSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("text_delta"),
    delta: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("text"),
    text: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("error"),
    error: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("result"),
    success: Schema.Literal(true),
    result: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("permission_request"),
    requestId: Schema.String,
    toolName: Schema.String,
    toolInput: AIJsonObjectSchema,
    title: Schema.optionalKey(Schema.String),
    displayName: Schema.optionalKey(Schema.String),
    description: Schema.optionalKey(Schema.String),
    toolUseId: Schema.String,
  }),
]);

export type AIChatStreamMessage = Schema.Schema.Type<typeof AIChatStreamMessageSchema>;

const decodeError = Schema.decodeUnknownOption(AIChatErrorSchema);

const decodeMessage = Schema.decodeUnknownOption(AIChatStreamMessageSchema);

const decodeSession = Schema.decodeUnknownOption(AIChatSessionSchema);

export function decodeAIChatError<Input>(value: Input): string | null {
  return Option.getOrNull(decodeError(value))?.error ?? null;
}

export function decodeAIChatSessionId<Input>(value: Input): string | null {
  return Option.getOrNull(decodeSession(value))?.sessionId ?? null;
}

export function decodeAIChatStreamMessage<Input>(value: Input): AIChatStreamMessage | null {
  return Option.getOrNull(decodeMessage(value));
}

const decodePayloadType = Schema.decodeUnknownOption(Schema.Struct({ type: Schema.String }));

/** True for undecodable `result` payloads; other undecodable traffic returns false. */
export function isMalformedResultPayload<Input>(value: Input): boolean {
  if (decodeAIChatStreamMessage(value) !== null) return false;

  return Option.getOrUndefined(decodePayloadType(value))?.type === "result";
}
