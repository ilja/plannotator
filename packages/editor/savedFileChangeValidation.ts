import type { SourceBackedSavedFileChangeDraftData } from './sourceBackedDocuments';
import type { SourceSaveProbeResult } from './sourceDocumentClient';

export interface SavedFileChangeValidationResult {
  valid: SourceBackedSavedFileChangeDraftData[];
  dropped: Array<{ change: SourceBackedSavedFileChangeDraftData; reason: 'changed' | 'missing' | 'noop' }>;
  unverified: SourceBackedSavedFileChangeDraftData[];
}

export async function validateSavedFileChanges(
  changes: SourceBackedSavedFileChangeDraftData[],
  resolveSourceSave: (change: SourceBackedSavedFileChangeDraftData) => Promise<SourceSaveProbeResult>,
): Promise<SavedFileChangeValidationResult> {
  const valid: SourceBackedSavedFileChangeDraftData[] = [];
  const dropped: SavedFileChangeValidationResult['dropped'] = [];
  const unverified: SourceBackedSavedFileChangeDraftData[] = [];

  for (const change of changes) {
    if (change.beforeText === change.afterText) {
      dropped.push({ change, reason: 'noop' });
      continue;
    }

    const expectedHash = change.afterHash ?? change.sourceSave.hash;
    const probe = await resolveSourceSave(change);
    if (probe.status === 'unavailable') {
      unverified.push(change);
      continue;
    }
    if (probe.status === 'missing') {
      dropped.push({ change, reason: 'missing' });
      continue;
    }
    if (probe.sourceSave.hash !== expectedHash) {
      dropped.push({ change, reason: 'changed' });
      continue;
    }

    valid.push({
      ...change,
      sourceSave: probe.sourceSave,
      afterHash: probe.sourceSave.hash,
    });
  }

  return { valid, dropped, unverified };
}
