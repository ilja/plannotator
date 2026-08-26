import { Option, Schema } from "effect";

const FoundValidationSchema = Schema.Struct({
  status: Schema.Literal("found"),
  resolved: Schema.String,
});
const AmbiguousValidationSchema = Schema.Struct({
  status: Schema.Literal("ambiguous"),
  matches: Schema.Array(Schema.String),
});
const MissingValidationSchema = Schema.Struct({
  status: Schema.Literal("missing"),
});
const UnavailableValidationSchema = Schema.Struct({
  status: Schema.Literal("unavailable"),
});
const ValidationEntrySchema = Schema.Union([
  FoundValidationSchema,
  AmbiguousValidationSchema,
  MissingValidationSchema,
  UnavailableValidationSchema,
]);
const CodePathValidationEnvelopeSchema = Schema.Struct({
  results: Schema.Record(Schema.String, Schema.Unknown),
});
const decodeEnvelope = Schema.decodeUnknownOption(CodePathValidationEnvelopeSchema);
const decodeEntry = Schema.decodeUnknownOption(ValidationEntrySchema);

type DecodedValidationEntry = Schema.Schema.Type<typeof ValidationEntrySchema>;

export type ValidationEntry =
  | { status: "found"; resolved: string }
  | { status: "ambiguous"; matches: string[] }
  | { status: "missing" }
  | { status: "unavailable" };

function normalizeValidationEntry(entry: DecodedValidationEntry): ValidationEntry {
  if (entry.status === "ambiguous") {
    return { status: entry.status, matches: [...entry.matches] };
  }
  return entry;
}

/** Decodes code-path validation results while retaining only valid entries. */
export function decodeCodePathValidationResponse<Input>(
  input: Input,
): Map<string, ValidationEntry> {
  const envelope = Option.getOrUndefined(decodeEnvelope(input));
  if (!envelope) return new Map();

  const results = new Map<string, ValidationEntry>();
  for (const [path, value] of Object.entries(envelope.results)) {
    const entry = Option.getOrUndefined(decodeEntry(value));
    if (entry) results.set(path, normalizeValidationEntry(entry));
  }
  return results;
}
