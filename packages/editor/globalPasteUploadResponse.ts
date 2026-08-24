import type { ImageAttachment } from '@plannotator/ui/types';
import { decodeAttachmentUploadResponse } from '@plannotator/ui/utils/attachmentUploadResponse';

type GlobalPasteUploadResponse = Pick<Response, 'ok' | 'json'>;

/** Decodes a successful global paste upload into an attachment; non-OK responses are ignored. */
export async function decodeGlobalPasteUploadResponse(
  response: GlobalPasteUploadResponse,
  name: string,
): Promise<ImageAttachment | undefined> {
  if (!response.ok) return undefined;

  const data = decodeAttachmentUploadResponse(await response.json());
  return { path: data.path, name };
}
