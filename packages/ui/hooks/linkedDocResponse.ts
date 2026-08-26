import {
  SourceSaveCapabilitySchema,
  type SourceSaveCapability,
} from "@plannotator/shared/source-save";
import { Option, Schema } from "effect";

const LinkedDocResponseEnvelopeSchema = Schema.Struct({
  filepath: Schema.String,
  markdown: Schema.optionalKey(Schema.Unknown),
  rawHtml: Schema.optionalKey(Schema.Unknown),
  shareHtml: Schema.optionalKey(Schema.Unknown),
  renderAs: Schema.optionalKey(Schema.Unknown),
  isConverted: Schema.optionalKey(Schema.Unknown),
  sourceSave: Schema.optionalKey(Schema.Unknown),
});

const LinkedDocErrorEnvelopeSchema = Schema.Struct({ error: Schema.String });
const decodeLinkedDocResponseEnvelope = Schema.decodeUnknownOption(LinkedDocResponseEnvelopeSchema);
const decodeLinkedDocErrorEnvelope = Schema.decodeUnknownOption(LinkedDocErrorEnvelopeSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeRenderAs = Schema.decodeUnknownOption(Schema.Literals(["markdown", "html"]));
const decodeBoolean = Schema.decodeUnknownOption(Schema.Boolean);
const decodeSourceSave = Schema.decodeUnknownOption(SourceSaveCapabilitySchema);

export interface LinkedDocResponse {
  filepath: string;
  markdown?: string;
  rawHtml?: string;
  shareHtml?: string;
  renderAs?: "markdown" | "html";
  isConverted?: boolean;
  sourceSave?: SourceSaveCapability;
}

/** Decodes the /api/doc success payload while isolating malformed optional fields. */
export function decodeLinkedDocResponse<Input>(input: Input): LinkedDocResponse | undefined {
  const response = Option.getOrUndefined(decodeLinkedDocResponseEnvelope(input));
  if (!response) return undefined;

  const markdown = Option.getOrUndefined(decodeString(response.markdown));
  const rawHtml = Option.getOrUndefined(decodeString(response.rawHtml));
  const shareHtml = Option.getOrUndefined(decodeString(response.shareHtml));
  const renderAs = Option.getOrUndefined(decodeRenderAs(response.renderAs));
  const isConverted = Option.getOrUndefined(decodeBoolean(response.isConverted));
  const sourceSave = Option.getOrUndefined(decodeSourceSave(response.sourceSave));

  const decodedResponse: LinkedDocResponse = { filepath: response.filepath };
  if (markdown !== undefined) decodedResponse.markdown = markdown;
  if (rawHtml !== undefined) decodedResponse.rawHtml = rawHtml;
  if (shareHtml !== undefined) decodedResponse.shareHtml = shareHtml;
  if (renderAs !== undefined) decodedResponse.renderAs = renderAs;
  if (isConverted !== undefined) decodedResponse.isConverted = isConverted;
  if (sourceSave !== undefined) decodedResponse.sourceSave = sourceSave;
  return decodedResponse;
}

/** Extracts a server error only when the /api/doc error envelope is valid. */
export function decodeLinkedDocErrorResponse<Input>(input: Input): string | undefined {
  return Option.getOrUndefined(decodeLinkedDocErrorEnvelope(input))?.error;
}
