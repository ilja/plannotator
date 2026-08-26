import { Schema } from 'effect';
import { AnnotationType } from '../types';
import { ChoiceValidationEvidenceSchema } from './choiceAnnotations';

/** Validates an image attachment stored with an annotation. */
export const ImageAttachmentSchema = Schema.Struct({
  path: Schema.String,
  name: Schema.String,
});

/** Validates the DOM selection metadata stored with an annotation range. */
export const SelectionMetaSchema = Schema.Struct({
  parentTagName: Schema.String,
  parentIndex: Schema.Finite,
  textOffset: Schema.Finite,
});

/** Validates a persisted document annotation record. */
export const AnnotationSchema = Schema.Struct({
  id: Schema.String,
  blockId: Schema.String,
  startOffset: Schema.Finite,
  endOffset: Schema.Finite,
  type: Schema.Literals([
    AnnotationType.DELETION,
    AnnotationType.COMMENT,
    AnnotationType.GLOBAL_COMMENT,
  ]),
  text: Schema.optionalKey(Schema.String),
  originalText: Schema.String,
  createdA: Schema.Finite,
  author: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
  images: Schema.optionalKey(Schema.mutable(Schema.Array(ImageAttachmentSchema))),
  isQuickLabel: Schema.optionalKey(Schema.Boolean),
  quickLabelTip: Schema.optionalKey(Schema.String),
  choiceOptionLabel: Schema.optionalKey(Schema.String),
  choiceValidationEvidence: Schema.optionalKey(ChoiceValidationEvidenceSchema),
  diffContext: Schema.optionalKey(Schema.Literals(['added', 'removed', 'modified'])),
  startMeta: Schema.optionalKey(SelectionMetaSchema),
  endMeta: Schema.optionalKey(SelectionMetaSchema),
});

/** Validates a persisted code annotation record. */
export const CodeAnnotationSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Literals(['comment', 'suggestion', 'concern']),
  scope: Schema.optionalKey(Schema.Literals(['line', 'file', 'general'])),
  filePath: Schema.String,
  lineStart: Schema.Finite,
  lineEnd: Schema.Finite,
  side: Schema.Literals(['old', 'new']),
  text: Schema.optionalKey(Schema.String),
  images: Schema.optionalKey(Schema.mutable(Schema.Array(ImageAttachmentSchema))),
  suggestedCode: Schema.optionalKey(Schema.String),
  originalCode: Schema.optionalKey(Schema.String),
  charStart: Schema.optionalKey(Schema.Finite),
  charEnd: Schema.optionalKey(Schema.Finite),
  tokenText: Schema.optionalKey(Schema.String),
  createdAt: Schema.Finite,
  author: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
  severity: Schema.optionalKey(Schema.Literals(['important', 'nit', 'pre_existing'])),
  reasoning: Schema.optionalKey(Schema.String),
  reviewProfileLabel: Schema.optionalKey(Schema.String),
  conventionalLabel: Schema.optionalKey(Schema.String),
  decorations: Schema.optionalKey(
    Schema.mutable(Schema.Array(Schema.Literals(['blocking', 'non-blocking', 'if-minor']))),
  ),
  prUrl: Schema.optionalKey(Schema.String),
  prNumber: Schema.optionalKey(Schema.Finite),
  prTitle: Schema.optionalKey(Schema.String),
  prRepo: Schema.optionalKey(Schema.String),
  diffScope: Schema.optionalKey(Schema.Literals(['layer', 'full-stack'])),
});

/** Decodes an unknown persisted document annotation, discarding mismatch details. */
export const decodeAnnotation = Schema.decodeUnknownOption(AnnotationSchema);

/** Decodes an unknown persisted code annotation, discarding mismatch details. */
export const decodeCodeAnnotation = Schema.decodeUnknownOption(CodeAnnotationSchema);

/** Decodes an unknown persisted image attachment, discarding mismatch details. */
export const decodeImageAttachment = Schema.decodeUnknownOption(ImageAttachmentSchema);
