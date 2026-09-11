import { Result, Schema } from "effect";

const SaveNotesTargetSchema = Schema.Struct({
  success: Schema.Boolean,
  error: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
});

const SaveNotesResponseEnvelopeSchema = Schema.Struct({
  results: Schema.Record(Schema.String, Schema.Unknown),
});

const saveNotesTargets = ["obsidian"] as const;

const decodeSaveNotesResponseEnvelope = Schema.decodeUnknownResult(SaveNotesResponseEnvelopeSchema);

const decodeSaveNotesTarget = Schema.decodeUnknownResult(SaveNotesTargetSchema);

type SaveNotesTarget = (typeof saveNotesTargets)[number];

type SaveNotesTargetResult = Schema.Schema.Type<typeof SaveNotesTargetSchema>;

type SaveNotesResults = Partial<Record<SaveNotesTarget, SaveNotesTargetResult>>;

/**
 * Decodes a save-notes response while retaining a valid Obsidian result.
 * The response envelope must contain a results record; malformed target results are omitted.
 */
export function decodeSaveNotesResponse<Input>(
  value: Input,
): Result.Result<SaveNotesResults, Schema.SchemaError> {
  const envelope = decodeSaveNotesResponseEnvelope(value);

  if (Result.isFailure(envelope)) return Result.fail(envelope.failure);

  const results: SaveNotesResults = {};

  for (const target of saveNotesTargets) {
    const decodedTarget = decodeSaveNotesTarget(envelope.success.results[target]);

    if (Result.isSuccess(decodedTarget)) results[target] = decodedTarget.success;
  }

  return Result.succeed(results);
}
