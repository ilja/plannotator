import { Schema } from 'effect';

const AttachmentUploadResponseSchema = Schema.Struct({
  path: Schema.String,
});

export const decodeAttachmentUploadResponse = Schema.decodeUnknownSync(
  AttachmentUploadResponseSchema,
);
