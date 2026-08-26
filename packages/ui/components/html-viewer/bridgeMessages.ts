import { Option, Schema } from "effect";

const PREFIX = "plannotator-bridge-";

const AnnotationTypeSchema = Schema.Literals(["comment", "deletion"]);
const BridgeOutboundMessageSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal(`${PREFIX}create-mark`),
    id: Schema.String,
    annotationType: AnnotationTypeSchema,
  }),
  Schema.Struct({
    type: Schema.Literal(`${PREFIX}find-and-mark`),
    id: Schema.String,
    originalText: Schema.String,
    annotationType: AnnotationTypeSchema,
  }),
  Schema.Struct({ type: Schema.Literal(`${PREFIX}remove-mark`), id: Schema.String }),
  Schema.Struct({ type: Schema.Literal(`${PREFIX}clear-marks`) }),
  Schema.Struct({ type: Schema.Literal(`${PREFIX}scroll-to`), id: Schema.String }),
  Schema.Struct({ type: Schema.Literal(`${PREFIX}focus-mark`), id: Schema.NullOr(Schema.String) }),
  Schema.Struct({
    type: Schema.Literal(`${PREFIX}set-input-method`),
    method: Schema.Literals(["drag", "pinpoint"]),
  }),
  Schema.Struct({
    type: Schema.Literal(`${PREFIX}theme`),
    tokens: Schema.Record(Schema.String, Schema.String),
    isLight: Schema.Boolean,
  }),
]);

type DecodedOutboundMessage = Schema.Schema.Type<typeof BridgeOutboundMessageSchema>;
export type HtmlBridgeOutboundMessage = DecodedOutboundMessage;

/** Decode messages before crossing the parent-to-iframe bridge. */
export function decodeHtmlBridgeOutboundMessage(value: any): HtmlBridgeOutboundMessage | undefined {
  const message = Option.getOrUndefined(
    Schema.decodeUnknownOption(BridgeOutboundMessageSchema)(value),
  );
  if (!message) return undefined;
  if ("id" in message && message.id !== null && message.id.length === 0) return undefined;
  if ("originalText" in message && message.originalText.length === 0) return undefined;
  return message;
}

export function postHtmlBridgeMessage(
  iframe: HTMLIFrameElement | null,
  value: HtmlBridgeOutboundMessage,
): void {
  const message = decodeHtmlBridgeOutboundMessage(value);
  if (message) iframe?.contentWindow?.postMessage(message, "*");
}
