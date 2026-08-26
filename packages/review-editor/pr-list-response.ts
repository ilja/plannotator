import { Result, Schema } from 'effect';

const PRSelectorItemSchema = Schema.Struct({
  id: Schema.String,
  number: Schema.Number,
  title: Schema.String,
  author: Schema.String,
  url: Schema.String,
  state: Schema.Literals(['open', 'closed', 'merged']),
});

const PRListResponseEnvelopeSchema = Schema.Struct({
  prs: Schema.Array(Schema.Unknown),
});

const decodePRListResponseEnvelope = Schema.decodeUnknownResult(PRListResponseEnvelopeSchema);
const decodePRSelectorItem = Schema.decodeUnknownResult(PRSelectorItemSchema);

/** A pull request record with the fields consumed by the PR selector. */
export type PRSelectorItem = Schema.Schema.Type<typeof PRSelectorItemSchema>;

/**
 * Decodes the PR list response envelope while retaining valid pull request siblings in source order.
 * A malformed envelope is returned as a failure; malformed PR entries are omitted.
 */
export function decodePRListResponse<Input>(
  value: Input,
): Result.Result<PRSelectorItem[], Schema.SchemaError> {
  const envelope = decodePRListResponseEnvelope(value);
  if (Result.isFailure(envelope)) return Result.fail(envelope.failure);

  return Result.succeed(envelope.success.prs.flatMap((entry) => {
    const decodedEntry = decodePRSelectorItem(entry);
    return Result.isSuccess(decodedEntry) ? [decodedEntry.success] : [];
  }));
}
