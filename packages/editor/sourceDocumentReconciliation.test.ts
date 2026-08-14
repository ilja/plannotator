import { describe, expect, test } from 'bun:test';
import type { SourceDocumentSnapshotResult } from './sourceDocumentClient';
import {
  reconcileSourceDocuments,
  type OpenSourceBackedDocumentRecord,
  type SourceDocumentReconcileEvent,
} from './sourceDocumentReconciliation';
import type { SourceBackedDocumentRecord, EnabledSourceSaveCapability } from './sourceBackedDocuments';

function sourceSave(hash: string, text = 'after\n'): EnabledSourceSaveCapability {
  return {
    enabled: true,
    kind: 'local-text-file',
    scope: 'folder-file',
    path: '/repo/docs/a.md',
    basename: 'a.md',
    language: 'markdown',
    hash,
    mtimeMs: hash === 'sha256:after' ? 1000 : 2000,
    size: text.length,
    eol: 'lf',
  };
}

function record(source = sourceSave('sha256:after'), text = 'after\n'): OpenSourceBackedDocumentRecord {
  return {
    key: 'file:/repo/docs/a.md',
    path: source.path,
    basename: source.basename,
    sourceSave: source,
    sessionOpenText: text,
    sessionOpenHash: source.hash,
    diskBaseline: text,
    currentText: text,
    editMountText: text,
    saveStatus: 'clean',
    lastKnownHash: source.hash,
    lastKnownMtimeMs: source.mtimeMs,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('reconcileSourceDocuments', () => {
  test('ignores an older disk read after a newer reconcile starts', async () => {
    let current: SourceBackedDocumentRecord = record();
    const oldFetch = deferred<SourceDocumentSnapshotResult>();
    const newSource = sourceSave('sha256:new', 'new\n');
    const fetches = [
      oldFetch.promise,
      Promise.resolve<SourceDocumentSnapshotResult>({
        status: 'ok',
        snapshot: { markdown: 'new\n', sourceSave: newSource },
      }),
    ];
    const applied: string[] = [];
    const appliedEvents: SourceDocumentReconcileEvent[] = [];
    const sequenceByKey = new Map<string, number>();
    const options = {
      documents: [current as OpenSourceBackedDocumentRecord],
      sequenceByKey,
      getSourceBackedDocument: () => current,
      fetchSnapshot: () => fetches.shift() ?? Promise.reject(new Error('unexpected fetch')),
      markSourceBackedDocumentFileMissing: () => null,
      reconcileDiskSnapshot: () => {
        applied.push(newSource.hash);
        current = record(newSource, 'new\n');
        return { type: 'clean-updated' as const, record: current, clearedSavedChange: false };
      },
      onEvent: (event) => appliedEvents.push(event),
    };

    const first = reconcileSourceDocuments(options);
    const second = reconcileSourceDocuments(options);

    await expect(second).resolves.toBe(true);
    const stateAfterNewerReconcile = structuredClone(current);
    const eventsAfterNewerReconcile = structuredClone(appliedEvents);
    oldFetch.resolve({
      status: 'ok',
      snapshot: { markdown: 'old\n', sourceSave: sourceSave('sha256:old', 'old\n') },
    });
    await expect(first).resolves.toBe(false);

    expect(applied).toEqual(['sha256:new']);
    expect(current).toEqual(stateAfterNewerReconcile);
    expect(appliedEvents).toEqual(eventsAfterNewerReconcile);
    expect(appliedEvents).toHaveLength(1);
  });

  test('ignores a disk read when the document changed while fetch was pending', async () => {
    let current: SourceBackedDocumentRecord = record();
    const staleFetch = deferred<SourceDocumentSnapshotResult>();
    let applied = false;
    const appliedEvents: SourceDocumentReconcileEvent[] = [];
    const reconcile = reconcileSourceDocuments({
      documents: [current as OpenSourceBackedDocumentRecord],
      sequenceByKey: new Map(),
      getSourceBackedDocument: () => current,
      fetchSnapshot: () => staleFetch.promise,
      markSourceBackedDocumentFileMissing: () => null,
      reconcileDiskSnapshot: () => {
        applied = true;
        return { type: 'clean-updated' as const, record: current, clearedSavedChange: false };
      },
      onEvent: (event) => appliedEvents.push(event),
    });

    current = record(sourceSave('sha256:newer', 'newer\n'), 'newer\n');
    const stateBeforeStaleReconcile = structuredClone(current);
    staleFetch.resolve({
      status: 'ok',
      snapshot: { markdown: 'old\n', sourceSave: sourceSave('sha256:old', 'old\n') },
    });

    await expect(reconcile).resolves.toBe(false);
    expect(applied).toBe(false);
    expect(current).toEqual(stateBeforeStaleReconcile);
    expect(appliedEvents).toEqual([]);
  });
});
