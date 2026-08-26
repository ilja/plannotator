import type { ExternalAnnotationEvent } from '@plannotator/shared/external-annotation';
import { Option, Schema } from 'effect';

const ExternalAnnotationEventEnvelopeSchema = Schema.Struct({
  type: Schema.String,
  annotations: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  ids: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  source: Schema.optionalKey(Schema.String),
  id: Schema.optionalKey(Schema.String),
  annotation: Schema.optionalKey(Schema.Unknown),
});

const ExternalAnnotationPollingEnvelopeSchema = Schema.Struct({
  annotations: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  version: Schema.optionalKey(Schema.Unknown),
});
const ExternalAnnotationValueSchema = Schema.Unknown;

/** Decodes the structural envelope of an untrusted real-time annotation event. */
export const decodeExternalAnnotationEventEnvelope = Schema.decodeUnknownOption(
  ExternalAnnotationEventEnvelopeSchema,
);
/** Decodes the structural envelope of an untrusted annotation polling response. */
export const decodeExternalAnnotationPollingEnvelope = Schema.decodeUnknownOption(
  ExternalAnnotationPollingEnvelopeSchema,
);
const decodeAnnotationId = Schema.decodeUnknownOption(Schema.String);
const decodeVersion = Schema.decodeUnknownOption(Schema.Natural);

type ExternalAnnotationEventEnvelope = Schema.Schema.Type<
  typeof ExternalAnnotationEventEnvelopeSchema
>;
type ExternalAnnotationPollingEnvelope = Schema.Schema.Type<
  typeof ExternalAnnotationPollingEnvelopeSchema
>;

/** Decodes an untrusted external annotation into its canonical application type. */
export type ExternalAnnotationDecoder<T> = (
  value: Schema.Schema.Type<typeof ExternalAnnotationValueSchema>,
) => Option.Option<T>;

/** A polling response whose annotations and version have both passed boundary validation. */
export interface ExternalAnnotationPollingSnapshot<T> {
  annotations: T[];
  version: number | null;
}

function decodeAnnotationSiblings<T>(
  values: ReadonlyArray<unknown>,
  decodeAnnotation: ExternalAnnotationDecoder<T>,
): T[] {
  const annotations: T[] = [];
  for (const value of values) {
    const decoded = decodeAnnotation(value);
    if (Option.isSome(decoded)) annotations.push(decoded.value);
  }
  return annotations;
}

function decodeAnnotationIdSiblings(values: ReadonlyArray<unknown>): string[] {
  const ids: string[] = [];
  for (const value of values) {
    const decoded = decodeAnnotationId(value);
    if (Option.isSome(decoded)) ids.push(decoded.value);
  }
  return ids;
}

/**
 * Parses a schema-decoded real-time annotation event, filtering invalid collection siblings.
 * Unknown event types and invalid update payloads are rejected as a whole.
 */
export function parseExternalAnnotationEvent<T extends { id: string; source?: string }>(
  envelope: ExternalAnnotationEventEnvelope,
  decodeAnnotation: ExternalAnnotationDecoder<T>,
): ExternalAnnotationEvent<T> | null {
  switch (envelope.type) {
    case 'snapshot':
    case 'add':
      if (!envelope.annotations) return null;
      return {
        type: envelope.type,
        annotations: decodeAnnotationSiblings(envelope.annotations, decodeAnnotation),
      };
    case 'remove':
      if (!envelope.ids) return null;
      return { type: 'remove', ids: decodeAnnotationIdSiblings(envelope.ids) };
    case 'clear':
      return envelope.source === undefined
        ? { type: 'clear' }
        : { type: 'clear', source: envelope.source };
    case 'update': {
      if (!envelope.id || envelope.annotation === undefined) return null;
      const annotation = decodeAnnotation(envelope.annotation);
      if (Option.isNone(annotation) || annotation.value.id !== envelope.id) return null;
      return { type: 'update', id: envelope.id, annotation: annotation.value };
    }
    default:
      return null;
  }
}

/**
 * Parses a polling response, preserving valid annotations when version metadata is absent or malformed.
 */
export function parseExternalAnnotationPollingSnapshot<T>(
  envelope: ExternalAnnotationPollingEnvelope,
  decodeAnnotation: ExternalAnnotationDecoder<T>,
): ExternalAnnotationPollingSnapshot<T> | null {
  if (!envelope.annotations) return null;
  const version = Option.getOrNull(decodeVersion(envelope.version));

  return {
    annotations: decodeAnnotationSiblings(envelope.annotations, decodeAnnotation),
    version,
  };
}
