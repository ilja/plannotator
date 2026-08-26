import { Option, Schema } from 'effect';
import type { EditorAnnotation } from '@plannotator/shared/types';

const EditorAnnotationSchema = Schema.Struct({
  id: Schema.String,
  filePath: Schema.String,
  selectedText: Schema.String,
  lineStart: Schema.Number,
  lineEnd: Schema.Number,
  createdAt: Schema.Number,
});
const EditorAnnotationsEnvelopeSchema = Schema.Struct({
  annotations: Schema.Array(Schema.Unknown),
});
const RecordSchema = Schema.Record(Schema.String, Schema.Unknown);
const decodeAnnotation = Schema.decodeUnknownOption(EditorAnnotationSchema);
const decodeEnvelope = Schema.decodeUnknownOption(EditorAnnotationsEnvelopeSchema);
const decodeRecord = Schema.decodeUnknownOption(RecordSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);

function decodeEditorAnnotation(value: Schema.Schema.Type<typeof Schema.Unknown>): EditorAnnotation | undefined {
  const annotation = Option.getOrUndefined(decodeAnnotation(value));
  if (!annotation) return undefined;

  const record = Option.getOrUndefined(decodeRecord(value));
  const comment = record ? Option.getOrUndefined(decodeString(record.comment)) : undefined;
  return comment === undefined ? annotation : { ...annotation, comment };
}

/** Decodes editor-annotation polling responses, retaining valid siblings. */
export function decodeEditorAnnotationsResponse(
  value: Schema.Schema.Type<typeof Schema.Unknown>,
): EditorAnnotation[] | undefined {
  const envelope = Option.getOrUndefined(decodeEnvelope(value));
  if (!envelope) return undefined;

  return envelope.annotations.flatMap((item) => {
    const annotation = decodeEditorAnnotation(item);
    return annotation ? [annotation] : [];
  });
}

/** Loads and validates an editor-annotation polling response. */
export async function loadEditorAnnotationsResponse(
  response: Response,
): Promise<EditorAnnotation[] | undefined> {
  if (!response.ok) return undefined;

  try {
    return decodeEditorAnnotationsResponse(await response.json());
  } catch {
    return undefined;
  }
}
