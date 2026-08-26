import { Option, Schema } from "effect";

const DiffFreshnessResponseSchema = Schema.Struct({
  fresh: Schema.Boolean,
  fingerprint: Schema.optionalKey(Schema.Unknown),
  agentCwd: Schema.optionalKey(Schema.Unknown),
});

type UnknownValue = Schema.Schema.Type<typeof Schema.Unknown>;

export interface DiffFreshnessResponse {
  fresh: boolean;
  fingerprint?: string;
  agentCwd?: string | null;
}

const decodeRoot = Schema.decodeUnknownOption(DiffFreshnessResponseSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeNullableString = Schema.decodeUnknownOption(Schema.NullOr(Schema.String));

/** Decode the unknown value returned by the `/api/diff/fresh` endpoint. */
export function decodeDiffFreshnessResponse(
  value: UnknownValue,
): DiffFreshnessResponse | undefined {
  const root = Option.getOrUndefined(decodeRoot(value));
  if (!root) return undefined;

  const fingerprint = Option.getOrUndefined(decodeString(root.fingerprint));
  const agentCwd = Option.getOrUndefined(decodeNullableString(root.agentCwd));

  return {
    fresh: root.fresh,
    ...(fingerprint !== undefined && { fingerprint }),
    ...(agentCwd !== undefined && { agentCwd }),
  };
}
