import { Option, Schema } from 'effect';
import type { CodeAnnotation } from '../types';
import { decodeCodeAnnotation } from './annotationSchemas';

const SuccessfulCodeAnnotationDraftSchema = Schema.Struct({
  codeAnnotations: Schema.optionalKey(Schema.Unknown),
  viewedFiles: Schema.optionalKey(Schema.Unknown),
  draftGeneration: Schema.optionalKey(Schema.Unknown),
  ts: Schema.optionalKey(Schema.Unknown),
});

const MissingCodeAnnotationDraftSchema = Schema.Struct({
  found: Schema.Literals([false]),
  draftGeneration: Schema.optionalKey(Schema.Unknown),
});

const DraftItemsSchema = Schema.Array(Schema.Unknown);
const decodeSuccessfulCodeAnnotationDraftEnvelope = Schema.decodeUnknownOption(
  SuccessfulCodeAnnotationDraftSchema,
);
const decodeMissingCodeAnnotationDraftEnvelope = Schema.decodeUnknownOption(
  MissingCodeAnnotationDraftSchema,
);
const decodeDraftItems = Schema.decodeUnknownOption(DraftItemsSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeFinite = Schema.decodeUnknownOption(Schema.Finite);
const decodeGeneration = Schema.decodeUnknownOption(Schema.Natural);

export interface DecodedSuccessfulCodeAnnotationDraft {
  codeAnnotations: CodeAnnotation[];
  viewedFiles: string[];
  draftGeneration: number | null;
  ts: number;
}

export interface DecodedMissingCodeAnnotationDraft {
  draftGeneration: number | null;
}

function readDraftItems<Input>(value: Input): ReadonlyArray<unknown> | null {
  return Option.getOrNull(decodeDraftItems(value));
}

function readCodeAnnotations<Input>(value: Input): CodeAnnotation[] {
  const items = readDraftItems(value);
  if (!items) return [];

  const annotations: CodeAnnotation[] = [];
  for (const item of items) {
    const annotation = Option.getOrNull(decodeCodeAnnotation(item));
    if (annotation) annotations.push(annotation);
  }
  return annotations;
}

function readViewedFiles<Input>(value: Input): string[] {
  const items = readDraftItems(value);
  if (!items) return [];

  const viewedFiles: string[] = [];
  for (const item of items) {
    const filePath = Option.getOrNull(decodeString(item));
    if (filePath !== null) viewedFiles.push(filePath);
  }
  return viewedFiles;
}

function readDraftGeneration<Input>(value: Input): number | null {
  return Option.getOrNull(decodeGeneration(value));
}

function readTimestamp<Input>(value: Input): number {
  return Option.getOrNull(decodeFinite(value)) ?? 0;
}

export function decodeSuccessfulCodeAnnotationDraft<Input>(
  value: Input,
): DecodedSuccessfulCodeAnnotationDraft | null {
  const envelope = Option.getOrNull(decodeSuccessfulCodeAnnotationDraftEnvelope(value));
  if (!envelope) return null;

  return {
    codeAnnotations: readCodeAnnotations(envelope.codeAnnotations),
    viewedFiles: readViewedFiles(envelope.viewedFiles),
    draftGeneration: readDraftGeneration(envelope.draftGeneration),
    ts: readTimestamp(envelope.ts),
  };
}

export function decodeMissingCodeAnnotationDraft<Input>(
  value: Input,
): DecodedMissingCodeAnnotationDraft | null {
  const envelope = Option.getOrNull(decodeMissingCodeAnnotationDraftEnvelope(value));
  if (!envelope) return null;

  return { draftGeneration: readDraftGeneration(envelope.draftGeneration) };
}
