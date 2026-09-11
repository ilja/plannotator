import type {
  SourceBackedDocumentDraftData,
  SourceBackedDraftSourceSaveCapability,
  SourceBackedSavedFileChangeDraftData,
} from "@plannotator/shared/draft";
import { SourceSaveCapabilitySchema } from "@plannotator/shared/source-save";
import { Option, Schema } from "effect";
import { type Annotation, type CodeAnnotation, type ImageAttachment } from "../types";
import { decodeAnnotation, decodeCodeAnnotation, decodeImageAttachment } from "./annotationSchemas";
import { decodeLegacyShareData, fromShareable, parseShareableImages } from "./sharing";

const SavedFileChangeInputSchema = Schema.Struct({
  key: Schema.String,
  path: Schema.String,
  basename: Schema.String,
  beforeText: Schema.String,
  afterText: Schema.String,
  beforeHash: Schema.optionalKey(Schema.String),
  afterHash: Schema.optionalKey(Schema.String),
  sourceSave: Schema.optionalKey(Schema.Unknown),
});

const SourceBackedDocumentInputSchema = Schema.Struct({
  key: Schema.String,
  sourceSave: Schema.Unknown,
  sessionOpenText: Schema.String,
  diskBaseline: Schema.String,
  currentText: Schema.String,
  missingOnDisk: Schema.optionalKey(Schema.Boolean),
  savedChange: Schema.optionalKey(Schema.Unknown),
});

const DraftEnvelopeSchema = Schema.Record(Schema.String, Schema.Unknown);

const DraftItemsSchema = Schema.Array(Schema.Unknown);

const DraftGenerationSchema = Schema.Natural;

const DraftGenerationCarrierSchema = Schema.Struct({
  draftGeneration: Schema.optionalKey(DraftGenerationSchema),
});

const decodeSavedFileChangeInput = Schema.decodeUnknownOption(SavedFileChangeInputSchema);

const decodeSourceBackedDocumentInput = Schema.decodeUnknownOption(SourceBackedDocumentInputSchema);

const decodeSourceSaveCapability = Schema.decodeUnknownOption(SourceSaveCapabilitySchema);

const decodeDraftEnvelope = Schema.decodeUnknownOption(DraftEnvelopeSchema);

const decodeDraftItems = Schema.decodeUnknownOption(DraftItemsSchema);

const decodeString = Schema.decodeUnknownOption(Schema.String);

const decodeNumber = Schema.decodeUnknownOption(Schema.Finite);

const decodeGeneration = Schema.decodeUnknownOption(DraftGenerationSchema);

const decodeGenerationCarrier = Schema.decodeUnknownOption(DraftGenerationCarrierSchema);

type DraftEnvelope = Schema.Schema.Type<typeof DraftEnvelopeSchema>;

type DraftItems = Schema.Schema.Type<typeof DraftItemsSchema>;

export interface DecodedStoredAnnotationDraft {
  annotations: Annotation[];
  codeAnnotations: CodeAnnotation[];
  globalAttachments: ImageAttachment[];
  editedMarkdown: string | null;
  editedDocuments: SourceBackedDocumentDraftData[];
  savedFileChanges: SourceBackedSavedFileChangeDraftData[];
  draftGeneration: number | null;
  ts: number;
}

function readDraftEnvelope<Input>(value: Input): DraftEnvelope | null {
  return Option.getOrNull(decodeDraftEnvelope(value));
}

function readDraftItems<Input>(value: Input): DraftItems | null {
  return Option.getOrNull(decodeDraftItems(value));
}

function readString<Input>(value: Input): string | null {
  return Option.getOrNull(decodeString(value));
}

function readNumber<Input>(value: Input): number | null {
  return Option.getOrNull(decodeNumber(value));
}

export function decodeStoredDraftGeneration<Input>(value: Input): number | null {
  const direct = Option.getOrNull(decodeGeneration(value));

  if (direct !== null) return direct;

  return Option.getOrNull(decodeGenerationCarrier(value))?.draftGeneration ?? null;
}

function readSourceSaveCapability<Input>(
  value: Input,
): SourceBackedDraftSourceSaveCapability | null {
  const decoded = Option.getOrNull(decodeSourceSaveCapability(value));

  return decoded?.enabled === true ? decoded : null;
}

function readAnnotations<Input>(value: Input): Annotation[] | null {
  const items = readDraftItems(value);

  if (!items) return null;
  const annotations: Annotation[] = [];

  for (const item of items) {
    const decoded = Option.getOrNull(decodeAnnotation(item));

    if (decoded) annotations.push(decoded);
  }

  return annotations;
}

function readCodeAnnotations<Input>(value: Input): CodeAnnotation[] | null {
  const items = readDraftItems(value);

  if (!items) return null;
  const annotations: CodeAnnotation[] = [];

  for (const item of items) {
    const decoded = Option.getOrNull(decodeCodeAnnotation(item));

    if (decoded) annotations.push(decoded);
  }

  return annotations;
}

function readImageAttachments<Input>(value: Input): ImageAttachment[] | null {
  const items = readDraftItems(value);

  if (!items) return null;
  const attachments: ImageAttachment[] = [];

  for (const item of items) {
    const decoded = Option.getOrNull(decodeImageAttachment(item));

    if (decoded) attachments.push(decoded);
  }

  return attachments;
}

function readSavedFileChange<Input>(
  value: Input,
  fallbackSourceSave?: SourceBackedDraftSourceSaveCapability,
): SourceBackedSavedFileChangeDraftData | null {
  const decoded = Option.getOrNull(decodeSavedFileChangeInput(value));

  if (!decoded) return null;
  const sourceSave = readSourceSaveCapability(decoded.sourceSave) ?? fallbackSourceSave;

  if (!sourceSave) return null;

  return {
    key: decoded.key,
    path: decoded.path,
    basename: decoded.basename,
    beforeText: decoded.beforeText,
    afterText: decoded.afterText,
    beforeHash: decoded.beforeHash,
    afterHash: decoded.afterHash,
    sourceSave,
  };
}

function readSourceBackedDocument<Input>(value: Input): SourceBackedDocumentDraftData | null {
  const decoded = Option.getOrNull(decodeSourceBackedDocumentInput(value));

  if (!decoded) return null;
  const sourceSave = readSourceSaveCapability(decoded.sourceSave);

  if (!sourceSave) return null;
  const savedChange = readSavedFileChange(decoded.savedChange, sourceSave);

  return {
    key: decoded.key,
    sourceSave,
    sessionOpenText: decoded.sessionOpenText,
    diskBaseline: decoded.diskBaseline,
    currentText: decoded.currentText,
    ...(decoded.missingOnDisk === true && { missingOnDisk: true }),
    ...(savedChange && { savedChange }),
  };
}

function readSourceBackedDocuments<Input>(value: Input): SourceBackedDocumentDraftData[] | null {
  const items = readDraftItems(value);

  if (!items) return null;
  const documents: SourceBackedDocumentDraftData[] = [];

  for (const item of items) {
    const decoded = readSourceBackedDocument(item);

    if (decoded) documents.push(decoded);
  }

  return documents;
}

function readSavedFileChanges<Input>(value: Input): SourceBackedSavedFileChangeDraftData[] | null {
  const items = readDraftItems(value);

  if (!items) return null;
  const changes: SourceBackedSavedFileChangeDraftData[] = [];

  for (const item of items) {
    const decoded = readSavedFileChange(item);

    if (decoded) changes.push(decoded);
  }

  return changes;
}

export function decodeStoredAnnotationDraft<Input>(
  value: Input,
): DecodedStoredAnnotationDraft | null {
  const envelope = readDraftEnvelope(value);

  if (!envelope) return null;

  const normalizedTimestamp = readNumber(envelope.ts) ?? 0;

  const legacy = decodeLegacyShareData({
    ...envelope,
    ts: normalizedTimestamp,
  });

  if (legacy) {
    return {
      annotations: legacy.a.length > 0 ? fromShareable(legacy.a, legacy.d) : [],
      codeAnnotations: [],
      globalAttachments: parseShareableImages(legacy.g) ?? [],
      editedMarkdown: null,
      editedDocuments: [],
      savedFileChanges: [],
      draftGeneration: null,
      ts: normalizedTimestamp,
    };
  }

  const annotations = readAnnotations(envelope.annotations);
  const codeAnnotations = readCodeAnnotations(envelope.codeAnnotations);
  const globalAttachments = readImageAttachments(envelope.globalAttachments);
  const editedMarkdown = readString(envelope.editedMarkdown);
  const editedDocuments = readSourceBackedDocuments(envelope.editedDocuments);
  const savedFileChanges = readSavedFileChanges(envelope.savedFileChanges);

  const hasDirectDraftField =
    annotations !== null ||
    codeAnnotations !== null ||
    globalAttachments !== null ||
    editedMarkdown !== null ||
    editedDocuments !== null ||
    savedFileChanges !== null;

  if (!hasDirectDraftField) return null;

  return {
    annotations: annotations ?? [],
    codeAnnotations: codeAnnotations ?? [],
    globalAttachments: globalAttachments ?? [],
    editedMarkdown,
    editedDocuments: editedDocuments ?? [],
    savedFileChanges: savedFileChanges ?? [],
    draftGeneration: decodeStoredDraftGeneration(envelope.draftGeneration),
    ts: normalizedTimestamp,
  };
}
