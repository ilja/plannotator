import { Option, Schema } from "effect";

const GitAddSuccessSchema = Schema.Struct({
  ok: Schema.Literal(true),
});

const GitAddErrorEnvelopeSchema = Schema.Struct({
  error: Schema.String,
});

type UnknownValue = Schema.Schema.Type<typeof Schema.Unknown>;

/** A validated successful `/api/git-add` response. */
export interface GitAddSuccessResponse {
  ok: true;
}

/** A validated failed `/api/git-add` response with a trusted string error. */
export interface GitAddErrorResponse {
  ok: false;
  error: string;
}

/** The validated success-or-error result used by the git-add flow. */
export type GitAddResponse = GitAddSuccessResponse | GitAddErrorResponse;

const GIT_ADD_FALLBACK_ERROR = "Failed";

const decodeSuccess = Schema.decodeUnknownOption(GitAddSuccessSchema);

const decodeErrorEnvelope = Schema.decodeUnknownOption(GitAddErrorEnvelopeSchema);

/** Decode the unknown JSON envelope returned by `/api/git-add`. */
export function decodeGitAddResponse(value: UnknownValue): GitAddResponse | undefined {
  const success = Option.getOrUndefined(decodeSuccess(value));

  if (success) return success;

  const errorEnvelope = Option.getOrUndefined(decodeErrorEnvelope(value));

  if (errorEnvelope) return { ok: false, error: errorEnvelope.error };

  return undefined;
}

/** Read and validate one `/api/git-add` response, using a safe fallback on malformed data. */
export async function readGitAddResponse(response: Response): Promise<GitAddResponse> {
  let value: UnknownValue;

  try {
    value = await response.json();
  } catch {
    return { ok: false, error: GIT_ADD_FALLBACK_ERROR };
  }

  if (response.ok) {
    const success = Option.getOrUndefined(decodeSuccess(value));

    return success ?? { ok: false, error: GIT_ADD_FALLBACK_ERROR };
  }

  const errorEnvelope = Option.getOrUndefined(decodeErrorEnvelope(value));

  return errorEnvelope?.error
    ? { ok: false, error: errorEnvelope.error }
    : { ok: false, error: GIT_ADD_FALLBACK_ERROR };
}
