import { Option, Schema } from 'effect';

const PRActionSuccessSchema = Schema.Struct({
  ok: Schema.Literal(true),
  prUrl: Schema.optionalKey(Schema.String),
});

const PRActionErrorEnvelopeSchema = Schema.Struct({
  error: Schema.String,
});

const PRActionSuccessMarkerSchema = Schema.Struct({
  ok: Schema.Literal(true),
});

type UnknownValue = Schema.Schema.Type<typeof Schema.Unknown>;

/** A validated successful `/api/pr-action` response; an empty URL remains compatible. */
export interface PRActionSuccessResponse {
  ok: true;
  prUrl?: string;
}

/** A validated failed `/api/pr-action` response with a trusted string error. */
export interface PRActionErrorResponse {
  ok: false;
  error: string;
}

/** The validated success-or-error result used by the PR action submission flow. */
export type PRActionResponse = PRActionSuccessResponse | PRActionErrorResponse;

const PR_ACTION_FALLBACK_ERROR = 'Failed to submit';
const decodeSuccess = Schema.decodeUnknownOption(PRActionSuccessSchema);
const decodeErrorEnvelope = Schema.decodeUnknownOption(PRActionErrorEnvelopeSchema);
const decodeSuccessMarker = Schema.decodeUnknownOption(PRActionSuccessMarkerSchema);

/** Decode the unknown JSON envelope returned by `/api/pr-action`. */
export function decodePRActionResponse(value: UnknownValue): PRActionResponse | undefined {
  const success = Option.getOrUndefined(decodeSuccess(value));
  if (success) return success;
  if (Option.isSome(decodeSuccessMarker(value))) return undefined;

  const errorEnvelope = Option.getOrUndefined(decodeErrorEnvelope(value));
  if (errorEnvelope) return { ok: false, error: errorEnvelope.error };

  return undefined;
}

/** Read and validate one `/api/pr-action` response, using a safe target fallback on malformed data. */
export async function readPRActionResponse(response: Response): Promise<PRActionResponse> {
  let decoded: PRActionResponse | undefined;
  try {
    decoded = decodePRActionResponse(await response.json());
  } catch {
    return { ok: false, error: PR_ACTION_FALLBACK_ERROR };
  }

  if (!response.ok) {
    return decoded?.ok === false
      ? decoded
      : { ok: false, error: PR_ACTION_FALLBACK_ERROR };
  }

  return decoded ?? { ok: false, error: PR_ACTION_FALLBACK_ERROR };
}
