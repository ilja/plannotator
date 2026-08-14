import { useCallback, useMemo, useRef, useState } from 'react';
import type { SourceSaveCapability } from '@plannotator/shared/source-save';

export type EnabledSourceSaveCapability = Extract<SourceSaveCapability, { enabled: true }>;

export type SourceBackedDocumentSaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error' | 'missing';

export interface SourceBackedSavedFileChange {
  key: string;
  path: string;
  basename: string;
  beforeText: string;
  afterText: string;
  beforeHash?: string;
  afterHash?: string;
}

export interface SourceBackedDocumentRecord {
  key: string;
  path?: string;
  basename: string;
  sourceSave: SourceSaveCapability | null;
  sessionOpenText: string;
  sessionOpenHash?: string;
  diskBaseline: string;
  currentText: string;
  editMountText: string;
  saveStatus: SourceBackedDocumentSaveStatus;
  lastKnownHash?: string;
  lastKnownMtimeMs?: number;
  savedChange?: SourceBackedSavedFileChange;
  missingOnDisk?: boolean;
  diskConflict?: {
    text: string;
    sourceSave: EnabledSourceSaveCapability;
  };
  error?: string;
}

export interface SourceBackedDocumentStatus {
  key: string;
  path?: string;
  status: SourceBackedDocumentSaveStatus;
  dirty: boolean;
  conflict: boolean;
}

export interface SourceBackedDocumentDraftData {
  key: string;
  sourceSave: EnabledSourceSaveCapability;
  sessionOpenText: string;
  diskBaseline: string;
  currentText: string;
  savedChange?: SourceBackedSavedFileChangeDraftData;
}

export interface SourceBackedSavedFileChangeDraftData extends SourceBackedSavedFileChange {
  sourceSave: EnabledSourceSaveCapability;
}

interface OpenSourceBackedDocumentInput {
  key: string;
  text: string;
  sourceSave: SourceSaveCapability | null;
}

export interface SourceBackedDocumentSaveInput {
  key: string;
  text: string;
  sourceSave: EnabledSourceSaveCapability;
  savedChangeBaseText?: string;
  savedChangeBaseHash?: string;
}

export interface SourceBackedDocumentDiskSnapshotInput {
  key: string;
  text: string;
  sourceSave: EnabledSourceSaveCapability;
}

interface UpdateSourceBackedDocumentTextOptions {
  forceNotify?: boolean;
}

function normalizeDocumentText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function basenameForCapability(sourceSave: SourceSaveCapability | null, fallbackKey: string): string {
  if (sourceSave?.enabled) return sourceSave.basename;
  const normalized = fallbackKey.replace(/\\/g, '/');
  return normalized.split('/').pop() || fallbackKey;
}

function recordIsDirty(record: SourceBackedDocumentRecord): boolean {
  return record.currentText !== record.diskBaseline;
}

function cleanOrDirty(record: SourceBackedDocumentRecord): SourceBackedDocumentSaveStatus {
  if (record.missingOnDisk) return 'missing';
  if (record.diskConflict) return 'conflict';
  return recordIsDirty(record) ? 'dirty' : 'clean';
}

function cloneRecord(record: SourceBackedDocumentRecord): SourceBackedDocumentRecord {
  return {
    ...record,
    sourceSave: record.sourceSave ? { ...record.sourceSave } : null,
    savedChange: record.savedChange ? { ...record.savedChange } : undefined,
    diskConflict: record.diskConflict
      ? { text: record.diskConflict.text, sourceSave: { ...record.diskConflict.sourceSave } }
      : undefined,
  };
}

export function sourceBackedDocumentKey(sourceSave: SourceSaveCapability | null | undefined, fallback: string): string {
  return sourceSave?.enabled ? `file:${sourceSave.path}` : fallback;
}

export function getSourceBackedDocumentKnownDiskHash(record: SourceBackedDocumentRecord | null | undefined): string | undefined {
  return record?.diskConflict?.sourceSave.hash
    ?? (record?.sourceSave?.enabled ? record.sourceSave.hash : record?.lastKnownHash);
}

export function canApplySourceBackedDocumentDiskSnapshot(
  record: SourceBackedDocumentRecord | null | undefined,
  expectedDiskHash: string | undefined,
): record is SourceBackedDocumentRecord & { sourceSave: EnabledSourceSaveCapability } {
  return (
    record?.sourceSave?.enabled === true &&
    record.saveStatus !== 'saving' &&
    getSourceBackedDocumentKnownDiskHash(record) === expectedDiskHash
  );
}

export function canRestoreSourceBackedDocumentDraft(
  record: SourceBackedDocumentRecord | null | undefined,
  sourceSave: EnabledSourceSaveCapability,
  diskBaseline: string,
): boolean {
  if (!record) return true;
  return (
    record.saveStatus === 'clean' &&
    record.sourceSave?.enabled === true &&
    record.sourceSave.path === sourceSave.path &&
    record.sourceSave.hash === sourceSave.hash &&
    record.diskBaseline === diskBaseline &&
    record.currentText === diskBaseline &&
    !record.savedChange &&
    !record.diskConflict &&
    !record.missingOnDisk
  );
}

export function markSourceBackedDocumentSaved(record: SourceBackedDocumentRecord, input: SourceBackedDocumentSaveInput): void {
  const normalized = normalizeDocumentText(input.text);
  const beforeText = normalizeDocumentText(input.savedChangeBaseText ?? record.sessionOpenText);
  const beforeHash = input.savedChangeBaseHash ?? record.sessionOpenHash;
  if (input.savedChangeBaseText !== undefined || input.savedChangeBaseHash !== undefined) {
    record.sessionOpenText = beforeText;
    record.sessionOpenHash = beforeHash;
  }
  record.diskBaseline = normalized;
  record.sourceSave = input.sourceSave;
  record.path = input.sourceSave.path;
  record.basename = input.sourceSave.basename;
  record.lastKnownHash = input.sourceSave.hash;
  record.lastKnownMtimeMs = input.sourceSave.mtimeMs;
  record.error = undefined;
  record.diskConflict = undefined;
  record.missingOnDisk = undefined;
  if (record.currentText === normalized) {
    record.editMountText = normalized;
    record.saveStatus = 'saved';
  } else {
    record.saveStatus = cleanOrDirty(record);
  }
  record.savedChange = normalized === beforeText
    ? undefined
    : {
        key: input.key,
        path: input.sourceSave.path,
        basename: input.sourceSave.basename,
        beforeText,
        afterText: normalized,
        beforeHash,
        afterHash: input.sourceSave.hash,
      };
}

export type SourceBackedDocumentDiskSnapshotReconcileResult =
  | { type: 'missing' }
  | { type: 'unchanged'; record: SourceBackedDocumentRecord }
  | { type: 'status-updated'; record: SourceBackedDocumentRecord }
  | { type: 'clean-updated'; record: SourceBackedDocumentRecord; clearedSavedChange: boolean }
  | { type: 'conflict'; record: SourceBackedDocumentRecord };

export type SourceBackedDocumentFileMissingReconcileResult =
  | { type: 'missing' }
  | { type: 'file-missing'; record: SourceBackedDocumentRecord; clearedSavedChange: boolean; alreadyMissing: boolean };

export function reconcileSourceBackedDocumentDiskSnapshot(
  record: SourceBackedDocumentRecord | undefined,
  input: SourceBackedDocumentDiskSnapshotInput,
): SourceBackedDocumentDiskSnapshotReconcileResult {
  if (!record) return { type: 'missing' };

  const normalized = normalizeDocumentText(input.text);
  const previousHash = getSourceBackedDocumentKnownDiskHash(record);
  const hashChanged = previousHash !== input.sourceSave.hash;
  if (!hashChanged) {
    const wasMissingOnDisk = !!record.missingOnDisk;
    record.path = input.sourceSave.path;
    record.basename = input.sourceSave.basename;
    record.lastKnownHash = input.sourceSave.hash;
    record.lastKnownMtimeMs = input.sourceSave.mtimeMs;
    record.missingOnDisk = undefined;
    record.error = undefined;
    if (record.diskConflict) {
      record.diskConflict = { text: normalized, sourceSave: input.sourceSave };
    } else {
      record.sourceSave = input.sourceSave;
    }
    if (wasMissingOnDisk) {
      record.saveStatus = cleanOrDirty(record);
      return { type: 'status-updated', record };
    }
    return { type: 'unchanged', record };
  }

  if (!recordIsDirty(record) && record.saveStatus !== 'conflict') {
    const clearedSavedChange = !!record.savedChange && record.savedChange.afterHash !== input.sourceSave.hash;
    record.sourceSave = input.sourceSave;
    record.path = input.sourceSave.path;
    record.basename = input.sourceSave.basename;
    record.sessionOpenText = normalized;
    record.sessionOpenHash = input.sourceSave.hash;
    record.diskBaseline = normalized;
    record.currentText = normalized;
    record.editMountText = normalized;
    record.saveStatus = 'clean';
    record.lastKnownHash = input.sourceSave.hash;
    record.lastKnownMtimeMs = input.sourceSave.mtimeMs;
    record.savedChange = undefined;
    record.missingOnDisk = undefined;
    record.diskConflict = undefined;
    record.error = undefined;
    return { type: 'clean-updated', record, clearedSavedChange };
  }

  record.path = input.sourceSave.path;
  record.basename = input.sourceSave.basename;
  record.lastKnownHash = input.sourceSave.hash;
  record.lastKnownMtimeMs = input.sourceSave.mtimeMs;
  record.savedChange = undefined;
  record.missingOnDisk = undefined;
  record.diskConflict = { text: normalized, sourceSave: input.sourceSave };
  record.saveStatus = 'conflict';
  record.error = 'The file changed on disk while you were editing.';
  return { type: 'conflict', record };
}

export function markSourceBackedDocumentFileMissing(
  record: SourceBackedDocumentRecord | undefined,
): SourceBackedDocumentFileMissingReconcileResult {
  if (!record) return { type: 'missing' };

  const clearedSavedChange = !!record.savedChange;
  const alreadyMissing = !!record.missingOnDisk && record.saveStatus === 'missing';
  record.savedChange = undefined;
  record.diskConflict = undefined;
  record.missingOnDisk = true;
  record.saveStatus = 'missing';
  record.error = 'The file no longer exists on disk.';
  return { type: 'file-missing', record, clearedSavedChange, alreadyMissing };
}

export function useSourceBackedDocuments() {
  const docsRef = useRef<Map<string, SourceBackedDocumentRecord>>(new Map());
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const openSourceBackedDocument = useCallback(({ key, text, sourceSave }: OpenSourceBackedDocumentInput) => {
    const normalized = normalizeDocumentText(text);
    const existing = docsRef.current.get(key);

    if (!existing) {
      docsRef.current.set(key, {
        key,
        path: sourceSave?.enabled ? sourceSave.path : undefined,
        basename: basenameForCapability(sourceSave, key),
        sourceSave,
        sessionOpenText: normalized,
        sessionOpenHash: sourceSave?.enabled ? sourceSave.hash : undefined,
        diskBaseline: normalized,
        currentText: normalized,
        editMountText: normalized,
        saveStatus: 'clean',
        lastKnownHash: sourceSave?.enabled ? sourceSave.hash : undefined,
        lastKnownMtimeMs: sourceSave?.enabled ? sourceSave.mtimeMs : undefined,
      });
      bump();
      return;
    }

    if (sourceSave?.enabled) {
      reconcileSourceBackedDocumentDiskSnapshot(existing, { key, text: normalized, sourceSave });
    } else if (!recordIsDirty(existing) && existing.saveStatus !== 'conflict') {
      existing.sourceSave = sourceSave;
      existing.basename = basenameForCapability(sourceSave, existing.basename);
      existing.diskBaseline = normalized;
      existing.currentText = normalized;
      existing.editMountText = normalized;
      existing.sessionOpenText = normalized;
      existing.sessionOpenHash = undefined;
      existing.saveStatus = 'clean';
      existing.savedChange = undefined;
      existing.diskConflict = undefined;
      existing.error = undefined;
    } else {
      existing.basename = basenameForCapability(sourceSave, existing.basename);
    }

    bump();
  }, [bump]);

  const getSourceBackedDocument = useCallback((key: string): SourceBackedDocumentRecord | null => {
    const record = docsRef.current.get(key);
    return record ? cloneRecord(record) : null;
  }, []);

  const getSourceBackedDocumentText = useCallback((key: string): string | null => {
    return docsRef.current.get(key)?.currentText ?? null;
  }, []);

  const beginSourceBackedDocumentEdit = useCallback((key: string, text: string) => {
    const record = docsRef.current.get(key);
    if (!record) return;
    const normalized = normalizeDocumentText(text);
    record.editMountText = normalized;
    record.currentText = normalized;
    const nextStatus = cleanOrDirty(record);
    if (record.saveStatus !== nextStatus) {
      record.saveStatus = nextStatus;
      bump();
    }
  }, [bump]);

  const updateSourceBackedDocumentText = useCallback((key: string, text: string, options?: UpdateSourceBackedDocumentTextOptions) => {
    const record = docsRef.current.get(key);
    if (!record) return;
    const normalized = normalizeDocumentText(text);
    const previousStatus = record.saveStatus;
    const previousText = record.currentText;
    record.currentText = normalized;
    record.saveStatus = previousStatus === 'saving' ? 'saving' : cleanOrDirty(record);
    if (previousStatus !== record.saveStatus || (options?.forceNotify && previousText !== normalized)) bump();
  }, [bump]);

  const markSourceBackedDocumentSaving = useCallback((key: string) => {
    const record = docsRef.current.get(key);
    if (!record) return;
    record.saveStatus = 'saving';
    record.error = undefined;
    bump();
  }, [bump]);

  const saveSourceBackedDocument = useCallback(({ key, text, sourceSave, savedChangeBaseText, savedChangeBaseHash }: SourceBackedDocumentSaveInput) => {
    const record = docsRef.current.get(key);
    if (!record) return;
    markSourceBackedDocumentSaved(record, { key, text, sourceSave, savedChangeBaseText, savedChangeBaseHash });
    bump();
  }, [bump]);

  const markSourceBackedDocumentError = useCallback((key: string, message: string) => {
    const record = docsRef.current.get(key);
    if (!record) return;
    record.saveStatus = 'error';
    record.error = message;
    bump();
  }, [bump]);

  const clearSourceBackedDocument = useCallback((key: string) => {
    docsRef.current.delete(key);
    bump();
  }, [bump]);

  const discardSourceBackedDocument = useCallback((key: string): SourceBackedDocumentRecord | null => {
    const record = docsRef.current.get(key);
    if (!record) return null;
    if (record.missingOnDisk) {
      const discarded = cloneRecord(record);
      docsRef.current.delete(key);
      bump();
      return discarded;
    }
    if (!recordIsDirty(record)) return null;
    record.currentText = record.diskBaseline;
    record.editMountText = record.diskBaseline;
    record.saveStatus = record.diskConflict ? cleanOrDirty(record) : record.savedChange ? 'saved' : 'clean';
    record.error = undefined;
    const discarded = cloneRecord(record);
    bump();
    return discarded;
  }, [bump]);

  const reconcileDiskSnapshot = useCallback((input: SourceBackedDocumentDiskSnapshotInput): SourceBackedDocumentDiskSnapshotReconcileResult => {
    const result = reconcileSourceBackedDocumentDiskSnapshot(docsRef.current.get(input.key), input);
    if (result.type !== 'missing' && result.type !== 'unchanged') bump();
    return result.type === 'missing'
      ? result
      : { ...result, record: cloneRecord(result.record) } as SourceBackedDocumentDiskSnapshotReconcileResult;
  }, [bump]);

  const reloadSourceBackedDocumentConflict = useCallback((key: string): SourceBackedDocumentRecord | null => {
    const record = docsRef.current.get(key);
    if (!record?.diskConflict) return null;
    const { text, sourceSave } = record.diskConflict;
    record.sourceSave = sourceSave;
    record.path = sourceSave.path;
    record.basename = sourceSave.basename;
    record.sessionOpenText = text;
    record.sessionOpenHash = sourceSave.hash;
    record.diskBaseline = text;
    record.currentText = text;
    record.editMountText = text;
    record.saveStatus = 'clean';
    record.lastKnownHash = sourceSave.hash;
    record.lastKnownMtimeMs = sourceSave.mtimeMs;
    record.savedChange = undefined;
    record.missingOnDisk = undefined;
    record.diskConflict = undefined;
    record.error = undefined;
    const reloaded = cloneRecord(record);
    bump();
    return reloaded;
  }, [bump]);

  const clearSourceBackedSavedFileChanges = useCallback((keys: Iterable<string>) => {
    let changed = false;
    for (const key of keys) {
      const record = docsRef.current.get(key);
      if (!record?.savedChange) continue;
      record.savedChange = undefined;
      if (!recordIsDirty(record) && !record.diskConflict && !record.missingOnDisk) {
        record.saveStatus = 'clean';
        record.sessionOpenText = record.diskBaseline;
        record.sessionOpenHash = record.sourceSave?.enabled ? record.sourceSave.hash : undefined;
      } else if (record.missingOnDisk) {
        record.saveStatus = 'missing';
      }
      changed = true;
    }
    if (changed) bump();
  }, [bump]);

  const restoreSourceBackedDraftDocuments = useCallback((documents: SourceBackedDocumentDraftData[]): string[] => {
    if (documents.length === 0) return [];

    const restoredKeys: string[] = [];

    for (const doc of documents) {
      const existing = docsRef.current.get(doc.key);
      const sessionOpenText = normalizeDocumentText(doc.sessionOpenText);
      const diskBaseline = normalizeDocumentText(doc.diskBaseline);
      const currentText = normalizeDocumentText(doc.currentText);
      if (!canRestoreSourceBackedDocumentDraft(existing, doc.sourceSave, diskBaseline)) continue;
      const savedChange = doc.savedChange
        ? {
            key: doc.savedChange.key,
            path: doc.savedChange.path,
            basename: doc.savedChange.basename,
            beforeText: normalizeDocumentText(doc.savedChange.beforeText),
            afterText: normalizeDocumentText(doc.savedChange.afterText),
            beforeHash: doc.savedChange.beforeHash,
            afterHash: doc.savedChange.afterHash,
          }
        : undefined;
      docsRef.current.set(doc.key, {
        key: doc.key,
        path: doc.sourceSave.path,
        basename: doc.sourceSave.basename,
        sourceSave: doc.sourceSave,
        sessionOpenText,
        sessionOpenHash: doc.sourceSave.hash,
        diskBaseline,
        currentText,
        editMountText: currentText,
        saveStatus: currentText === diskBaseline ? 'clean' : 'dirty',
        lastKnownHash: doc.sourceSave.hash,
        lastKnownMtimeMs: doc.sourceSave.mtimeMs,
        savedChange,
      });
      restoredKeys.push(doc.key);
    }

    if (restoredKeys.length > 0) bump();
    return restoredKeys;
  }, [bump]);

  const restoreSourceBackedSavedFileChanges = useCallback((changes: SourceBackedSavedFileChangeDraftData[]) => {
    if (changes.length === 0) return;

    for (const change of changes) {
      if (change.beforeText === change.afterText) continue;
      const existing = docsRef.current.get(change.key);

      const beforeText = normalizeDocumentText(change.beforeText);
      const afterText = normalizeDocumentText(change.afterText);
      // A dirty restored buffer is more specific than a saved-change card.
      // restoreSourceBackedDraftDocuments carries savedChange too, so do not overwrite it.
      if (!canRestoreSourceBackedDocumentDraft(existing, change.sourceSave, afterText)) continue;
      docsRef.current.set(change.key, {
        key: change.key,
        path: change.sourceSave.path,
        basename: change.sourceSave.basename,
        sourceSave: change.sourceSave,
        sessionOpenText: beforeText,
        sessionOpenHash: change.beforeHash,
        diskBaseline: afterText,
        currentText: afterText,
        editMountText: afterText,
        saveStatus: 'saved',
        lastKnownHash: change.sourceSave.hash,
        lastKnownMtimeMs: change.sourceSave.mtimeMs,
        savedChange: {
          key: change.key,
          path: change.sourceSave.path,
          basename: change.sourceSave.basename,
          beforeText,
          afterText,
          beforeHash: change.beforeHash,
          afterHash: change.afterHash ?? change.sourceSave.hash,
        },
      });
    }

    bump();
  }, [bump]);

  const markSourceBackedDocumentMissing = useCallback((key: string): { record: SourceBackedDocumentRecord; clearedSavedChange: boolean; alreadyMissing: boolean } | null => {
    const result = markSourceBackedDocumentFileMissing(docsRef.current.get(key));
    if (result.type === 'missing') return null;
    if (!result.alreadyMissing || result.clearedSavedChange) bump();
    return { record: cloneRecord(result.record), clearedSavedChange: result.clearedSavedChange, alreadyMissing: result.alreadyMissing };
  }, [bump]);

  const getUnsavedSourceBackedDocuments = useCallback((): SourceBackedDocumentRecord[] => {
    return Array.from(docsRef.current.values())
      .filter((record) => recordIsDirty(record) || !!record.diskConflict)
      .map(cloneRecord);
  }, []);

  const getSourceBackedSavedFileChanges = useCallback((): SourceBackedSavedFileChange[] => {
    return Array.from(docsRef.current.values())
      .map((record) => record.savedChange)
      .filter((change): change is SourceBackedSavedFileChange => !!change);
  }, []);

  const getSourceBackedDraftDocuments = useCallback((): SourceBackedDocumentDraftData[] => {
    return Array.from(docsRef.current.values())
      .filter((record): record is SourceBackedDocumentRecord & { sourceSave: EnabledSourceSaveCapability } =>
        record.sourceSave?.enabled === true && recordIsDirty(record)
      )
      .map((record) => ({
        key: record.key,
        sourceSave: record.sourceSave,
        sessionOpenText: record.sessionOpenText,
        diskBaseline: record.diskBaseline,
        currentText: record.currentText,
        savedChange: record.savedChange ? { ...record.savedChange, sourceSave: record.sourceSave } : undefined,
      }));
  }, []);

  const getSourceBackedDraftSavedFileChanges = useCallback((): SourceBackedSavedFileChangeDraftData[] => {
    return Array.from(docsRef.current.values())
      .filter((record): record is SourceBackedDocumentRecord & { sourceSave: EnabledSourceSaveCapability; savedChange: SourceBackedSavedFileChange } =>
        record.sourceSave?.enabled === true && !!record.savedChange && !recordIsDirty(record)
      )
      .map((record) => ({
        ...record.savedChange,
        sourceSave: record.sourceSave,
      }));
  }, []);

  const getSourceBackedDocuments = useCallback((): Array<SourceBackedDocumentRecord & { sourceSave: EnabledSourceSaveCapability }> => {
    return Array.from(docsRef.current.values())
      .filter((record): record is SourceBackedDocumentRecord & { sourceSave: EnabledSourceSaveCapability } =>
        record.sourceSave?.enabled === true
      )
      .map((record) => cloneRecord(record) as SourceBackedDocumentRecord & { sourceSave: EnabledSourceSaveCapability });
  }, []);

  const getFileEditStatuses = useCallback((): Map<string, SourceBackedDocumentStatus> => {
    const statuses = new Map<string, SourceBackedDocumentStatus>();
    for (const record of docsRef.current.values()) {
      if (!record.path) continue;
      statuses.set(record.path, {
        key: record.key,
        path: record.path,
        status: record.saveStatus,
        dirty: recordIsDirty(record),
        conflict: !!record.diskConflict,
      });
    }
    return statuses;
  }, []);

  const fileEditStatuses = useMemo(() => getFileEditStatuses(), [getFileEditStatuses, version]);

  return {
    version,
    fileEditStatuses,
    openSourceBackedDocument,
    getSourceBackedDocument,
    getSourceBackedDocumentText,
    beginSourceBackedDocumentEdit,
    updateSourceBackedDocumentText,
    markSourceBackedDocumentSaving,
    saveSourceBackedDocument,
    markSourceBackedDocumentError,
    markSourceBackedDocumentMissing,
    clearSourceBackedDocument,
    discardSourceBackedDocument,
    reconcileDiskSnapshot,
    reloadSourceBackedDocumentConflict,
    clearSourceBackedSavedFileChanges,
    restoreSourceBackedDraftDocuments,
    restoreSourceBackedSavedFileChanges,
    getUnsavedSourceBackedDocuments,
    getSourceBackedSavedFileChanges,
    getSourceBackedDraftDocuments,
    getSourceBackedDraftSavedFileChanges,
    getSourceBackedDocuments,
  };
}
