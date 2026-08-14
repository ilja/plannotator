import { pathIsInsideDir } from '@plannotator/shared/browser-paths';
import {
  canApplySourceBackedDocumentDiskSnapshot,
  getSourceBackedDocumentKnownDiskHash,
  type SourceBackedDocumentDiskSnapshotReconcileResult,
  type SourceBackedDocumentRecord,
  type EnabledSourceSaveCapability,
} from './sourceBackedDocuments';
import type { SourceDocumentSnapshotResult } from './sourceDocumentClient';

export type OpenSourceBackedDocumentRecord = SourceBackedDocumentRecord & { sourceSave: EnabledSourceSaveCapability };

export type SourceDocumentReconcileEvent =
  | {
      type: 'file-missing';
      result: { record: SourceBackedDocumentRecord; clearedSavedChange: boolean; alreadyMissing: boolean };
    }
  | { type: 'clean-updated'; result: Extract<SourceBackedDocumentDiskSnapshotReconcileResult, { type: 'clean-updated' }> }
  | { type: 'status-updated'; result: Extract<SourceBackedDocumentDiskSnapshotReconcileResult, { type: 'status-updated' }> }
  | { type: 'conflict'; result: Extract<SourceBackedDocumentDiskSnapshotReconcileResult, { type: 'conflict' }> };

interface ReconcileSourceDocumentsOptions {
  changedDir?: string;
  documents: OpenSourceBackedDocumentRecord[];
  sequenceByKey: Map<string, number>;
  getSourceBackedDocument: (key: string) => SourceBackedDocumentRecord | null;
  fetchSnapshot: (path: string) => Promise<SourceDocumentSnapshotResult>;
  markSourceBackedDocumentFileMissing: (key: string) => { record: SourceBackedDocumentRecord; clearedSavedChange: boolean; alreadyMissing: boolean } | null;
  reconcileDiskSnapshot: (input: {
    key: string;
    text: string;
    sourceSave: EnabledSourceSaveCapability;
  }) => SourceBackedDocumentDiskSnapshotReconcileResult;
  onEvent: (event: SourceDocumentReconcileEvent) => void;
}

export async function reconcileSourceDocuments({
  changedDir,
  documents,
  sequenceByKey,
  getSourceBackedDocument,
  fetchSnapshot,
  markSourceBackedDocumentFileMissing,
  reconcileDiskSnapshot,
  onEvent,
}: ReconcileSourceDocumentsOptions): Promise<boolean> {
  const docs = documents.filter((doc) => !changedDir || pathIsInsideDir(doc.sourceSave.path, changedDir));
  let changed = false;

  for (const doc of docs) {
    const startRecord = getSourceBackedDocument(doc.key);
    if (startRecord?.saveStatus === 'saving') continue;
    const expectedDiskHash = getSourceBackedDocumentKnownDiskHash(startRecord);
    const seq = (sequenceByKey.get(doc.key) ?? 0) + 1;
    sequenceByKey.set(doc.key, seq);
    const snapshotResult = await fetchSnapshot(doc.sourceSave.path);
    if (sequenceByKey.get(doc.key) !== seq) continue;
    const currentRecord = getSourceBackedDocument(doc.key);
    if (!canApplySourceBackedDocumentDiskSnapshot(currentRecord, expectedDiskHash)) continue;

    if (snapshotResult.status === 'missing') {
      const result = markSourceBackedDocumentFileMissing(doc.key);
      if (!result) continue;
      if (!result.alreadyMissing || result.clearedSavedChange) changed = true;
      onEvent({ type: 'file-missing', result });
      continue;
    }

    if (snapshotResult.status === 'unavailable') continue;

    const { snapshot } = snapshotResult;
    const result = reconcileDiskSnapshot({
      key: doc.key,
      text: snapshot.markdown,
      sourceSave: snapshot.sourceSave,
    });

    if (result.type === 'clean-updated') {
      changed = true;
      onEvent({ type: 'clean-updated', result });
    } else if (result.type === 'status-updated') {
      changed = true;
      onEvent({ type: 'status-updated', result });
    } else if (result.type === 'conflict') {
      changed = true;
      onEvent({ type: 'conflict', result });
    }
  }

  return changed;
}
