import { Option, Schema } from "effect";

const CodeFileEnvelopeSchema = Schema.Struct({
  contents: Schema.String,
  filepath: Schema.String,
});
const CodeFileErrorEnvelopeSchema = Schema.Struct({ error: Schema.String });
const StringRecordSchema = Schema.Record(Schema.String, Schema.Unknown);
const decodeCodeFileEnvelope = Schema.decodeUnknownOption(CodeFileEnvelopeSchema);
const decodeCodeFileErrorEnvelope = Schema.decodeUnknownOption(CodeFileErrorEnvelopeSchema);
const decodeRecord = Schema.decodeUnknownOption(StringRecordSchema);
const decodeBoolean = Schema.decodeUnknownOption(Schema.Boolean);
const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeNumber = Schema.decodeUnknownOption(Schema.Number);

export interface CodeFileResponse {
  readonly contents: string;
  readonly filepath: string;
  readonly codeFile?: boolean;
  readonly prerenderedHTML?: string;
  readonly line?: number;
  readonly lineEnd?: number;
}

/** Decodes a successful `/api/doc` code-file response. */
export function decodeCodeFileSuccessResponse<Input>(input: Input): CodeFileResponse | undefined {
  const envelope = Option.getOrUndefined(decodeCodeFileEnvelope(input));
  if (!envelope) return undefined;

  const record = Option.getOrUndefined(decodeRecord(input));
  if (!record) return envelope;

  const codeFile = Option.getOrUndefined(decodeBoolean(record.codeFile));
  const prerenderedHTML = Option.getOrUndefined(decodeString(record.prerenderedHTML));
  const line = Option.getOrUndefined(decodeNumber(record.line));
  const lineEnd = Option.getOrUndefined(decodeNumber(record.lineEnd));

  return {
    ...envelope,
    ...(codeFile !== undefined && { codeFile }),
    ...(prerenderedHTML !== undefined && { prerenderedHTML }),
    ...(line !== undefined && { line }),
    ...(lineEnd !== undefined && { lineEnd }),
  };
}

/** Extracts a server-provided code-file error only when it is a string. */
export function decodeCodeFileErrorResponse<Input>(input: Input): string | undefined {
  return Option.getOrUndefined(decodeCodeFileErrorEnvelope(input))?.error;
}
