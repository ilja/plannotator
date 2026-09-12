import { flow, Result, Schema } from "effect";

export type SemanticDiffStatus = "ok" | "unavailable" | "error";

const SemanticDiffSummarySchema = Schema.Struct({
  fileCount: Schema.Number,
  added: Schema.Number,
  modified: Schema.Number,
  deleted: Schema.Number,
  moved: Schema.Number,
  renamed: Schema.Number,
  reordered: Schema.Number,
  binary: Schema.Number,
  orphan: Schema.Number,
  total: Schema.Number,
});

export type SemanticDiffSummary = Schema.Schema.Type<typeof SemanticDiffSummarySchema>;

const SemanticDiffChangeSchema = Schema.Struct({
  entityId: Schema.NullOr(Schema.String),
  changeType: Schema.String,
  entityType: Schema.String,
  entityName: Schema.String,
  oldEntityName: Schema.NullOr(Schema.String),
  filePath: Schema.String,
  oldFilePath: Schema.NullOr(Schema.String),
  startLine: Schema.NullOr(Schema.Number),
  endLine: Schema.NullOr(Schema.Number),
  oldStartLine: Schema.NullOr(Schema.Number),
  oldEndLine: Schema.NullOr(Schema.Number),
  structuralChange: Schema.NullOr(Schema.Boolean),
});

export type SemanticDiffChange = Schema.Schema.Type<typeof SemanticDiffChangeSchema>;

const SemanticDiffBinaryChangeSchema = Schema.Struct({
  changeType: Schema.Literal("binary"),
  filePath: Schema.String,
  oldFilePath: Schema.NullOr(Schema.String),
  fileStatus: Schema.NullOr(Schema.String),
});

export type SemanticDiffBinaryChange = Schema.Schema.Type<typeof SemanticDiffBinaryChangeSchema>;

const SemanticDiffOkResponseSchema = Schema.Struct({
  status: Schema.Literal("ok"),
  summary: SemanticDiffSummarySchema,
  changes: Schema.Array(SemanticDiffChangeSchema),
  binaryChanges: Schema.Array(SemanticDiffBinaryChangeSchema),
  semVersion: Schema.String,
  semSource: Schema.String,
});

export type SemanticDiffOkResponse = Schema.Schema.Type<typeof SemanticDiffOkResponseSchema>;

const SemanticDiffOkResponseEnvelopeSchema = Schema.Struct({
  status: Schema.Literal("ok"),
  summary: SemanticDiffSummarySchema,
  changes: Schema.Array(Schema.Unknown),
  binaryChanges: Schema.Array(Schema.Unknown),
  semVersion: Schema.String,
  semSource: Schema.String,
});

const SemanticDiffUnavailableResponseSchema = Schema.Struct({
  status: Schema.Literal("unavailable"),
  reason: Schema.String,
  message: Schema.String,
});

export type SemanticDiffUnavailableResponse = Schema.Schema.Type<
  typeof SemanticDiffUnavailableResponseSchema
>;

const SemanticDiffErrorResponseSchema = Schema.Struct({
  status: Schema.Literal("error"),
  reason: Schema.String,
  message: Schema.String,
  exitCode: Schema.optionalKey(Schema.Number),
  stderr: Schema.optionalKey(Schema.String),
  semVersion: Schema.optionalKey(Schema.String),
  semSource: Schema.optionalKey(Schema.String),
});

export type SemanticDiffErrorResponse = Schema.Schema.Type<typeof SemanticDiffErrorResponseSchema>;

const SemanticDiffResponseSchema = Schema.Union([
  SemanticDiffOkResponseSchema,
  SemanticDiffUnavailableResponseSchema,
  SemanticDiffErrorResponseSchema,
]);

export type SemanticDiffResponse = Schema.Schema.Type<typeof SemanticDiffResponseSchema>;

const SemanticDiffResponseEnvelopeSchema = Schema.Union([
  SemanticDiffOkResponseEnvelopeSchema,
  SemanticDiffUnavailableResponseSchema,
  SemanticDiffErrorResponseSchema,
]);

type SemanticDiffResponseEnvelope = Schema.Schema.Type<typeof SemanticDiffResponseEnvelopeSchema>;

const decodeSemanticDiffChange = Schema.decodeUnknownResult(SemanticDiffChangeSchema);

const decodeSemanticDiffBinaryChange = Schema.decodeUnknownResult(SemanticDiffBinaryChangeSchema);

function decodeSemanticDiffChanges(changes: ReadonlyArray<unknown>): SemanticDiffChange[] {
  return changes.flatMap((change) => {
    const result = decodeSemanticDiffChange(change);

    return Result.isSuccess(result) ? [result.success] : [];
  });
}

function decodeSemanticDiffBinaryChanges(
  changes: ReadonlyArray<unknown>,
): SemanticDiffBinaryChange[] {
  return changes.flatMap((change) => {
    const result = decodeSemanticDiffBinaryChange(change);

    return Result.isSuccess(result) ? [result.success] : [];
  });
}

function retainValidSemanticDiffEntries(
  response: SemanticDiffResponseEnvelope,
): SemanticDiffResponse {
  if (response.status !== "ok") return response;

  return {
    ...response,
    changes: decodeSemanticDiffChanges(response.changes),
    binaryChanges: decodeSemanticDiffBinaryChanges(response.binaryChanges),
  };
}

/** Decode a semantic diff response while retaining valid records around malformed list entries. */
export const decodeSemanticDiffResponse = flow(
  Schema.decodeUnknownSync(SemanticDiffResponseEnvelopeSchema),
  retainValidSemanticDiffEntries,
);

/**
 * Semantic-diff availability. A ready binary carries version metadata and no
 * failure fields; a missing binary carries a reason and no version fields —
 * `available: true` with a `reason` (or vice versa) is unrepresentable.
 */
export type SemanticDiffAvailability =
  | {
      available: true;
      reason?: never;
      message?: never;
      semVersion?: string;
      semSource?: string;
    }
  | {
      available: false;
      reason: string;
      message: string;
      semVersion?: never;
      semSource?: never;
    };

export interface SemanticDiffAdvert {
  available: boolean;
  semVersion?: string;
  semSource?: string;
}
