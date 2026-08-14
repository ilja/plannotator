import type { SourceBackedDocumentDraftData } from './sourceBackedDocuments';

export function pickRestoredSingleFileDraftToDisplay(
  documents: SourceBackedDocumentDraftData[],
  restoredKeys: string[],
  activeKey: string | null,
): SourceBackedDocumentDraftData | undefined {
  const restored = documents.filter((doc) =>
    doc.sourceSave.scope === 'single-file' && restoredKeys.includes(doc.key)
  );
  if (activeKey) return restored.find((doc) => doc.key === activeKey);
  return restored.length === 1 ? restored[0] : undefined;
}
