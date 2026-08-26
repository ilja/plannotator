import { Result, Schema } from 'effect';

const OpenInSuccessResponseSchema = Schema.Struct({
  ok: Schema.Literal(true),
});

const OpenInFailureResponseSchema = Schema.Struct({
  ok: Schema.Literal(false),
  error: Schema.String,
});

const OpenInResponseSchema = Schema.Union([
  OpenInSuccessResponseSchema,
  OpenInFailureResponseSchema,
]);

/** The validated success or failure envelope returned by POST /api/open-in. */
export type OpenInResponse = Schema.Schema.Type<typeof OpenInResponseSchema>;

const decodeOpenInResponseEnvelope = Schema.decodeUnknownResult(OpenInResponseSchema);

/** Decodes an unknown POST /api/open-in response into a validated response envelope. */
export function decodeOpenInResponse<Input>(
  value: Input,
): Result.Result<OpenInResponse, Schema.SchemaError> {
  return decodeOpenInResponseEnvelope(value);
}

/**
 * Reads and validates a successful POST /api/open-in response.
 * Non-OK responses and invalid JSON return null without exposing their bodies.
 */
export async function readOpenInResponse(response: Response): Promise<OpenInResponse | null> {
  if (!response.ok) return null;

  const body: unknown = await response.json().catch(() => null);
  const decoded = decodeOpenInResponse(body);
  return Result.isSuccess(decoded) ? decoded.success : null;
}
