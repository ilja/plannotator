import { Option, Schema } from "effect";

const FileContentResponseSchema = Schema.Struct({
  oldContent: Schema.NullOr(Schema.String),
  newContent: Schema.NullOr(Schema.String),
});

export type FileContentResponse = Schema.Schema.Type<typeof FileContentResponseSchema>;

type UnknownValue = Schema.Schema.Type<typeof Schema.Unknown>;

const decodeResponse = Schema.decodeUnknownOption(FileContentResponseSchema);

/** Decode the unknown successful response from `/api/file-content`. */
export function decodeFileContentResponse(value: UnknownValue): FileContentResponse | null {
  return Option.getOrNull(decodeResponse(value));
}

/** Load and validate `/api/file-content`, returning null when no content is safe to use. */
export async function loadFileContentResponse(
  response: Response,
): Promise<FileContentResponse | null> {
  if (!response.ok) return null;

  try {
    return decodeFileContentResponse(await response.json());
  } catch {
    return null;
  }
}
