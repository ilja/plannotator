import { Option, Schema } from "effect";

const CodeNavFileResponseSchema = Schema.Struct({
  content: Schema.String,
});

type CodeNavFileResponse = Schema.Schema.Type<typeof CodeNavFileResponseSchema>;

type UnknownValue = Schema.Schema.Type<typeof Schema.Unknown>;

const decodeResponse = Schema.decodeUnknownOption(CodeNavFileResponseSchema);

/** Decode the unknown successful response from `/api/code-nav/file`. */
export function decodeCodeNavFileResponse(value: UnknownValue): CodeNavFileResponse | undefined {
  return Option.getOrUndefined(decodeResponse(value));
}
