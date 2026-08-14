import { afterEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  useSourceBackedDocuments,
  type SourceBackedDocumentLifecycleOptions,
  type EnabledSourceSaveCapability,
} from './sourceBackedDocuments';

const hasDom = typeof document !== 'undefined';

type SourceBackedDocumentsApi = ReturnType<typeof useSourceBackedDocuments>;

function sourceSave(hash: string, text: string): EnabledSourceSaveCapability {
  return {
    enabled: true,
    kind: 'local-text-file',
    scope: 'folder-file',
    path: '/repo/docs/a.md',
    basename: 'a.md',
    language: 'markdown',
    hash,
    mtimeMs: hash === 'sha256:a' ? 1000 : hash === 'sha256:b' ? 2000 : 3000,
    size: text.length,
    eol: 'lf',
  };
}

const KEY = 'file:/repo/docs/a.md';
const SOURCE_A = sourceSave('sha256:a', 'a\n');
const SOURCE_B = sourceSave('sha256:b', 'b\n');
const SOURCE_EXTERNAL = sourceSave('sha256:external', 'external\n');
const SOURCE_OVERWRITE = sourceSave('sha256:overwrite', 'local\n');

let roots: Root[] = [];
let containers: HTMLElement[] = [];

async function mountSourceBackedDocuments(options: SourceBackedDocumentLifecycleOptions = {}): Promise<{
  current: () => SourceBackedDocumentsApi;
  select: (key: string | null) => Promise<void>;
  unmount: () => Promise<void>;
}> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);

  let latest: SourceBackedDocumentsApi | null = null;
  let selectKey: ((key: string | null) => void) | null = null;
  function Harness() {
    const [, setSelectedKey] = React.useState<string | null>(null);
    selectKey = setSelectedKey;
    latest = useSourceBackedDocuments(options);
    return null;
  }

  await act(async () => {
    root.render(<Harness />);
  });

  return {
    current: () => {
      if (!latest) throw new Error('hook was not mounted');
      return latest;
    },
    select: async (key) => {
      if (!selectKey) throw new Error('selection harness was not mounted');
      await act(async () => {
        selectKey?.(key);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      roots = roots.filter((entry) => entry !== root);
      containers = containers.filter((entry) => entry !== container);
    },
  };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  for (const container of containers.splice(0)) container.remove();
});

describe('useSourceBackedDocuments lifecycle actions', () => {
  test.skipIf(!hasDom)('editing the current text preserves the disk baseline', async () => {
    const session = await mountSourceBackedDocuments();

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
    });

    const doc = session.current().getSourceBackedDocument(KEY);
    expect(doc?.sessionOpenText).toBe('a\n');
    expect(doc?.diskBaseline).toBe('a\n');
    expect(doc?.currentText).toBe('local\n');
    expect(doc?.saveStatus).toBe('dirty');
    expect(doc?.sourceSave).toEqual(SOURCE_A);

    await session.unmount();
  });

  test.skipIf(!hasDom)('document snapshots do not mutate collection state', async () => {
    const session = await mountSourceBackedDocuments({
      readSourceDocument: async () => ({ status: 'ok', snapshot: { markdown: 'external\n', sourceSave: SOURCE_EXTERNAL } }),
    });
    const initialSource = { ...SOURCE_A };

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: initialSource });
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
      await session.current().reconcileSourceBackedDocuments();
    });

    const snapshot = session.current().getSourceBackedDocument(KEY);
    if (!snapshot?.diskConflict || !snapshot.sourceSave?.enabled) throw new Error('expected a conflict snapshot');
    snapshot.currentText = 'mutated\n';
    snapshot.sourceSave.hash = 'sha256:mutated';
    snapshot.diskConflict.text = 'mutated external\n';
    snapshot.diskConflict.sourceSave.hash = 'sha256:mutated';

    const current = session.current().getSourceBackedDocument(KEY);
    expect(current?.currentText).toBe('local\n');
    expect(current?.sourceSave?.enabled && current.sourceSave.hash).toBe('sha256:a');
    expect(current?.diskConflict?.text).toBe('external\n');
    expect(current?.diskConflict?.sourceSave.hash).toBe('sha256:external');

    await session.unmount();
  });

  test.skipIf(!hasDom)('keeps stable keyed snapshots while selection moves outside the collection', async () => {
    const session = await mountSourceBackedDocuments();
    const secondKey = 'file:/repo/docs/b.md';

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().openSourceBackedDocument({ key: secondKey, text: 'b\n', sourceSave: SOURCE_B });
    });

    await session.select(KEY);
    const firstSnapshot = session.current().getSourceBackedDocument(KEY);
    const secondSnapshot = session.current().getSourceBackedDocument(secondKey);
    expect(firstSnapshot?.currentText).toBe('a\n');
    expect(secondSnapshot?.currentText).toBe('b\n');
    await session.select(secondKey);

    expect(session.current().getSourceBackedDocument(KEY)).toEqual(firstSnapshot);
    expect(session.current().getSourceBackedDocument(secondKey)).toEqual(secondSnapshot);

    await session.unmount();
  });

  test.skipIf(!hasDom)('discarding edits restores the existing file baseline', async () => {
    const session = await mountSourceBackedDocuments();

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
    });

    let discarded: ReturnType<SourceBackedDocumentsApi['discardSourceBackedDocumentEdits']>;
    await act(async () => {
      discarded = session.current().discardSourceBackedDocumentEdits(KEY);
    });

    expect(discarded.type).toBe('document-discarded');
    if (discarded.type !== 'document-discarded') throw new Error('expected discarded document');
    expect(discarded.record.currentText).toBe('a\n');
    expect(discarded.record.diskBaseline).toBe('a\n');
    expect(discarded.record.saveStatus).toBe('clean');
    expect(session.current().getSourceBackedDocument(KEY)?.currentText).toBe('a\n');
    expect(session.current().getUnsavedSourceBackedDocuments()).toEqual([]);

    await session.unmount();
  });
});

describe('useSourceBackedDocuments conflict actions', () => {
  test.skipIf(!hasDom)('overwrite conflict records the diff from the latest disk version', async () => {
    const session = await mountSourceBackedDocuments({
      readSourceDocument: async () => ({ status: 'ok', snapshot: { markdown: 'external\n', sourceSave: SOURCE_EXTERNAL } }),
      saveSourceDocument: async () => ({ status: 'saved', sourceSave: SOURCE_OVERWRITE }),
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'b\n', sourceSave: SOURCE_B });
      session.current().beginSourceBackedDocumentEdit(KEY, 'b\n');
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
      await session.current().reconcileSourceBackedDocuments();
    });

    expect(session.current().getSourceBackedDocument(KEY)?.diskConflict?.sourceSave.hash).toBe('sha256:external');

    let saved: Awaited<ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>>;
    await act(async () => {
      saved = await session.current().saveSourceBackedDocument({
        key: KEY,
        text: 'local\n',
        overwriteDiskConflict: true,
      });
    });
    expect(saved).toEqual(expect.objectContaining({ type: 'save-succeeded' }));

    const doc = session.current().getSourceBackedDocument(KEY);
    expect(doc?.diskConflict).toBeUndefined();
    expect(doc?.saveStatus).toBe('saved');
    expect(doc?.savedChange).toEqual({
      key: KEY,
      path: SOURCE_OVERWRITE.path,
      basename: SOURCE_OVERWRITE.basename,
      beforeText: 'external\n',
      afterText: 'local\n',
      beforeHash: 'sha256:external',
      afterHash: 'sha256:overwrite',
    });

    await session.unmount();
  });

  test.skipIf(!hasDom)('reload conflict discards the local buffer and adopts disk', async () => {
    const session = await mountSourceBackedDocuments({
      readSourceDocument: async () => ({ status: 'ok', snapshot: { markdown: 'external\n', sourceSave: SOURCE_EXTERNAL } }),
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'b\n', sourceSave: SOURCE_B });
      session.current().beginSourceBackedDocumentEdit(KEY, 'b\n');
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
      await session.current().reconcileSourceBackedDocuments();
    });

    let reloaded: ReturnType<SourceBackedDocumentsApi['reloadSourceBackedDocument']>;
    await act(async () => {
      reloaded = session.current().reloadSourceBackedDocument(KEY);
    });
    expect(reloaded.type).toBe('document-reloaded');

    const doc = session.current().getSourceBackedDocument(KEY);
    expect(doc?.currentText).toBe('external\n');
    expect(doc?.diskBaseline).toBe('external\n');
    expect(doc?.sessionOpenText).toBe('external\n');
    expect(doc?.saveStatus).toBe('clean');
    expect(doc?.savedChange).toBeUndefined();
    expect(doc?.diskConflict).toBeUndefined();
    expect(session.current().getUnsavedSourceBackedDocuments()).toEqual([]);

    await session.unmount();
  });

  test.skipIf(!hasDom)('dirty saved-then-edited drafts keep saved context nested without duplicating it', async () => {
    const session = await mountSourceBackedDocuments({
      saveSourceDocument: async () => ({ status: 'saved', sourceSave: SOURCE_B }),
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().beginSourceBackedDocumentEdit(KEY, 'a\n');
      session.current().updateSourceBackedDocumentText(KEY, 'b\n');
      await session.current().saveSourceBackedDocument({ key: KEY, text: 'b\n' });
      session.current().updateSourceBackedDocumentText(KEY, 'c\n');
    });

    expect(session.current().getSourceBackedDraftDocuments()).toEqual([{
      key: KEY,
      sourceSave: SOURCE_B,
      sessionOpenText: 'a\n',
      diskBaseline: 'b\n',
      currentText: 'c\n',
      savedChange: {
        key: KEY,
        path: SOURCE_B.path,
        basename: SOURCE_B.basename,
        beforeText: 'a\n',
        afterText: 'b\n',
        beforeHash: 'sha256:a',
        afterHash: 'sha256:b',
        sourceSave: SOURCE_B,
      },
    }]);
    expect(session.current().getSourceBackedDraftSavedFileChanges()).toEqual([]);

    await session.unmount();
  });

  test.skipIf(!hasDom)('restoring draft documents does not overwrite a live dirty buffer', async () => {
    const session = await mountSourceBackedDocuments();

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'b\n', sourceSave: SOURCE_B });
      session.current().beginSourceBackedDocumentEdit(KEY, 'b\n');
      session.current().updateSourceBackedDocumentText(KEY, 'live edit\n');
    });

    const restoredKeys = session.current().restoreSourceBackedDraftDocuments([{
      key: KEY,
      sourceSave: SOURCE_B,
      sessionOpenText: 'draft open\n',
      diskBaseline: 'draft disk\n',
      currentText: 'draft edit\n',
    }]);

    const doc = session.current().getSourceBackedDocument(KEY);
    expect(restoredKeys).toEqual([]);
    expect(doc?.currentText).toBe('live edit\n');
    expect(doc?.diskBaseline).toBe('b\n');
    expect(doc?.saveStatus).toBe('dirty');

    await session.unmount();
  });

  test.skipIf(!hasDom)('missing source files keep the buffer and clear stale saved context', async () => {
    const session = await mountSourceBackedDocuments({
      readSourceDocument: async () => ({ status: 'missing' }),
      saveSourceDocument: async () => ({ status: 'saved', sourceSave: SOURCE_B }),
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().updateSourceBackedDocumentText(KEY, 'b\n');
      await session.current().saveSourceBackedDocument({ key: KEY, text: 'b\n' });
    });
    await act(async () => {
      await session.current().reconcileSourceBackedDocuments();
    });

    const doc = session.current().getSourceBackedDocument(KEY);
    expect(doc?.currentText).toBe('b\n');
    expect(doc?.diskBaseline).toBe('b\n');
    expect(doc?.saveStatus).toBe('missing');
    expect(doc?.missingOnDisk).toBe(true);
    expect(doc?.savedChange).toBeUndefined();
    expect(doc?.diskConflict).toBeUndefined();

    await session.unmount();
  });

  test.skipIf(!hasDom)('saving a missing source file clears missing state', async () => {
    const session = await mountSourceBackedDocuments({
      readSourceDocument: async () => ({ status: 'missing' }),
      saveSourceDocument: async () => ({ status: 'saved', sourceSave: SOURCE_B }),
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      await session.current().reconcileSourceBackedDocuments();
      await session.current().saveSourceBackedDocument({ key: KEY, text: 'a\n' });
    });

    const doc = session.current().getSourceBackedDocument(KEY);
    expect(doc?.saveStatus).toBe('saved');
    expect(doc?.missingOnDisk).toBeUndefined();
    expect(doc?.error).toBeUndefined();

    await session.unmount();
  });

  test.skipIf(!hasDom)('discarding a missing source file removes the in-memory buffer', async () => {
    const session = await mountSourceBackedDocuments({
      readSourceDocument: async () => ({ status: 'missing' }),
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      await session.current().reconcileSourceBackedDocuments();
      session.current().discardSourceBackedDocumentEdits(KEY);
    });

    expect(session.current().getSourceBackedDocument(KEY)).toBeNull();
    expect(session.current().getSourceBackedDocument(KEY)).toBeNull();
    expect(session.current().getUnsavedSourceBackedDocuments()).toEqual([]);

    await session.unmount();
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe('useSourceBackedDocuments lifecycle commands', () => {
  test.skipIf(!hasDom)('returns applied, unavailable, and ignored read outcomes', async () => {
    const firstRead = deferred<Awaited<ReturnType<NonNullable<SourceBackedDocumentLifecycleOptions['readSourceDocument']>>>>();
    const reads = [
      firstRead.promise,
      Promise.resolve({ status: 'ok' as const, snapshot: { markdown: 'external\n', sourceSave: SOURCE_EXTERNAL } }),
    ];
    const session = await mountSourceBackedDocuments({
      readSourceDocument: () => reads.shift() ?? Promise.resolve({ status: 'unavailable' as const }),
      saveSourceDocument: async () => ({ status: 'saved', sourceSave: SOURCE_B }),
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
    });
    const older = session.current().reconcileSourceBackedDocuments();
    const newer = session.current().reconcileSourceBackedDocuments();
    let newerOutcomes: Awaited<typeof newer> = [];
    await act(async () => { newerOutcomes = await newer; });
    firstRead.resolve({ status: 'ok', snapshot: { markdown: 'old\n', sourceSave: SOURCE_B } });
    let olderOutcomes: Awaited<typeof older> = [];
    await act(async () => { olderOutcomes = await older; });

    expect(newerOutcomes).toEqual([expect.objectContaining({ type: 'disk-update-applied', previousText: 'a\n' })]);
    expect(olderOutcomes).toEqual([expect.objectContaining({ type: 'disk-observation-ignored', reason: 'stale-sequence' })]);
    expect(session.current().getSourceBackedDocument(KEY)?.currentText).toBe('external\n');

    await act(async () => {
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
    });
    const unavailable = session.current().reconcileSourceBackedDocuments();
    let unavailableOutcomes: Awaited<typeof unavailable> = [];
    await act(async () => { unavailableOutcomes = await unavailable; });
    expect(unavailableOutcomes).toEqual([{ type: 'disk-observation-unavailable', key: KEY }]);
    expect(session.current().getSourceBackedDocument(KEY)?.currentText).toBe('local\n');

    const staleRead = deferred<Awaited<ReturnType<NonNullable<SourceBackedDocumentLifecycleOptions['readSourceDocument']>>>>();
    reads.push(staleRead.promise);
    const staleReconcile = session.current().reconcileSourceBackedDocuments();
    await act(async () => {
      await session.current().saveSourceBackedDocument({ key: KEY, text: 'b\n' });
    });
    staleRead.resolve({ status: 'ok', snapshot: { markdown: 'old\n', sourceSave: SOURCE_EXTERNAL } });
    let staleOutcomes: Awaited<typeof staleReconcile> = [];
    await act(async () => { staleOutcomes = await staleReconcile; });
    expect(staleOutcomes).toEqual([expect.objectContaining({ type: 'disk-observation-ignored', reason: 'known-disk-hash-changed' })]);

    await session.unmount();
  });

  test.skipIf(!hasDom)('classifies dirty external reads and confirmed missing reads', async () => {
    const reads = [
      Promise.resolve({ status: 'ok' as const, snapshot: { markdown: 'external\n', sourceSave: SOURCE_EXTERNAL } }),
      Promise.resolve({ status: 'missing' as const }),
    ];
    const session = await mountSourceBackedDocuments({
      readSourceDocument: () => reads.shift() ?? Promise.resolve({ status: 'unavailable' as const }),
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
    });
    let conflict: Awaited<ReturnType<SourceBackedDocumentsApi['reconcileSourceBackedDocuments']>> = [];
    await act(async () => { conflict = await session.current().reconcileSourceBackedDocuments(); });
    expect(conflict).toEqual([expect.objectContaining({ type: 'disk-conflict-applied' })]);
    expect(session.current().getSourceBackedDocument(KEY)?.diskConflict?.text).toBe('external\n');

    let missing: Awaited<ReturnType<SourceBackedDocumentsApi['reconcileSourceBackedDocuments']>> = [];
    await act(async () => { missing = await session.current().reconcileSourceBackedDocuments(); });
    expect(missing).toEqual([expect.objectContaining({ type: 'missing-file' })]);
    expect(session.current().getSourceBackedDocument(KEY)?.missingOnDisk).toBe(true);
    expect(session.current().getSourceBackedDocument(KEY)?.currentText).toBe('local\n');

    await session.unmount();
  });

  test.skipIf(!hasDom)('saves through the adapter and applies complete conflict snapshots', async () => {
    const saveRequests: Array<Parameters<NonNullable<SourceBackedDocumentLifecycleOptions['saveSourceDocument']>>[0]> = [];
    let saveResult: Awaited<ReturnType<NonNullable<SourceBackedDocumentLifecycleOptions['saveSourceDocument']>>> = {
      status: 'saved',
      sourceSave: { hash: 'sha256:saved', mtimeMs: 4000, size: 6, eol: 'lf' },
    };
    const session = await mountSourceBackedDocuments({
      saveSourceDocument: async (input) => {
        saveRequests.push(input);
        return saveResult;
      },
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
    });
    let saved: Awaited<ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>>;
    await act(async () => {
      saved = await session.current().saveSourceBackedDocument({ key: KEY, text: 'local\n' });
    });
    expect(saved).toEqual(expect.objectContaining({ type: 'save-succeeded' }));
    expect(session.current().getSourceBackedDocument(KEY)?.saveStatus).toBe('saved');

    saveResult = {
      status: 'conflict',
      message: 'changed',
      snapshot: { text: 'external\n', hash: 'sha256:external', mtimeMs: 5000, size: 9, eol: 'lf' },
    };
    await act(async () => {
      session.current().updateSourceBackedDocumentText(KEY, 'overwrite\n');
    });
    let conflict: Awaited<ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>>;
    await act(async () => {
      conflict = await session.current().saveSourceBackedDocument({ key: KEY, text: 'overwrite\n' });
    });
    expect(conflict).toEqual(expect.objectContaining({ type: 'save-conflict' }));
    expect(session.current().getSourceBackedDocument(KEY)?.diskConflict).toEqual(expect.objectContaining({ text: 'external\n' }));

    saveResult = {
      status: 'saved',
      sourceSave: { hash: 'sha256:overwrite', mtimeMs: 6000, size: 10, eol: 'lf' },
    };
    let overwritten: Awaited<ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>>;
    await act(async () => {
      overwritten = await session.current().saveSourceBackedDocument({
        key: KEY,
        text: 'overwrite\n',
        overwriteDiskConflict: true,
      });
    });
    expect(overwritten).toEqual(expect.objectContaining({ type: 'save-succeeded' }));
    expect(saveRequests.at(-1)).toEqual(expect.objectContaining({
      baseHash: 'sha256:external',
      text: 'overwrite\n',
    }));
    expect(session.current().getSourceBackedDocument(KEY)?.savedChange).toEqual(expect.objectContaining({
      beforeText: 'external\n',
      beforeHash: 'sha256:external',
      afterText: 'overwrite\n',
    }));

    await session.unmount();
  });

  test.skipIf(!hasDom)('ignores a concurrent save while the first save is pending', async () => {
    type AdapterSaveResult = Awaited<NonNullable<SourceBackedDocumentLifecycleOptions['saveSourceDocument']>>;
    let resolveSave!: (result: AdapterSaveResult) => void;
    const saveRequests: string[] = [];
    const pendingSave = new Promise<AdapterSaveResult>((resolve) => {
      resolveSave = resolve;
    });
    const session = await mountSourceBackedDocuments({
      saveSourceDocument: async (input) => {
        saveRequests.push(input.text);
        return pendingSave;
      },
    });

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
    });

    let firstSave: ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>;
    await act(async () => {
      firstSave = session.current().saveSourceBackedDocument({ key: KEY, text: 'local\n' });
    });

    let secondSave: Awaited<ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>>;
    await act(async () => {
      secondSave = await session.current().saveSourceBackedDocument({ key: KEY, text: 'second\n' });
    });
    expect(secondSave!).toEqual({ type: 'save-command-ignored', key: KEY, reason: 'saving' });
    expect(saveRequests).toEqual(['local\n']);
    expect(session.current().getSourceBackedDocument(KEY)?.saveStatus).toBe('saving');

    resolveSave({
      status: 'saved',
      sourceSave: { hash: 'sha256:saved', mtimeMs: 4000, size: 6, eol: 'lf' },
    });
    let firstOutcome: Awaited<ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>>;
    await act(async () => {
      firstOutcome = await firstSave!;
    });
    expect(firstOutcome!).toEqual(expect.objectContaining({ type: 'save-succeeded' }));
    expect(session.current().getSourceBackedDocument(KEY)?.currentText).toBe('local\n');

    await session.unmount();
  });

  test.skipIf(!hasDom)('fails closed for incomplete conflict snapshots and write failures', async () => {
    let saveResult: Awaited<ReturnType<NonNullable<SourceBackedDocumentLifecycleOptions['saveSourceDocument']>>> = {
      status: 'conflict-incomplete',
      message: 'changed',
    };
    const session = await mountSourceBackedDocuments({ saveSourceDocument: async () => saveResult });
    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
    });

    let incomplete: Awaited<ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>>;
    await act(async () => { incomplete = await session.current().saveSourceBackedDocument({ key: KEY, text: 'local\n' }); });
    expect(incomplete).toEqual(expect.objectContaining({ type: 'save-error', reason: 'conflict-snapshot-unavailable' }));
    expect(session.current().getSourceBackedDocument(KEY)?.diskConflict).toBeUndefined();

    saveResult = { status: 'error', code: 'write-failed', message: 'read-only' };
    let failed: Awaited<ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>>;
    await act(async () => { failed = await session.current().saveSourceBackedDocument({ key: KEY, text: 'local\n' }); });
    expect(failed).toEqual(expect.objectContaining({ type: 'save-error', reason: 'write-failed', message: 'read-only' }));
    expect(session.current().getSourceBackedDocument(KEY)?.saveStatus).toBe('error');

    await session.unmount();
  });

  test.skipIf(!hasDom)('reloads a clean buffer when Save reports a complete conflict snapshot', async () => {
    const session = await mountSourceBackedDocuments({
      saveSourceDocument: async () => ({
        status: 'conflict',
        message: 'changed',
        snapshot: { text: 'external\n', hash: 'sha256:external', mtimeMs: 5000, size: 9, eol: 'lf' },
      }),
    });
    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
    });

    let outcome: Awaited<ReturnType<SourceBackedDocumentsApi['saveSourceBackedDocument']>>;
    await act(async () => { outcome = await session.current().saveSourceBackedDocument({ key: KEY, text: 'a\n' }); });
    expect(outcome).toEqual(expect.objectContaining({ type: 'save-disk-update-applied', previousText: 'a\n' }));
    expect(session.current().getSourceBackedDocument(KEY)?.currentText).toBe('external\n');
    expect(session.current().getSourceBackedDocument(KEY)?.diskConflict).toBeUndefined();

    await session.unmount();
  });

  test.skipIf(!hasDom)('reloads and discards through lifecycle outcomes', async () => {
    const session = await mountSourceBackedDocuments({
      readSourceDocument: async () => ({ status: 'ok', snapshot: { markdown: 'external\n', sourceSave: SOURCE_EXTERNAL } }),
    });
    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
      await session.current().reconcileSourceBackedDocuments();
    });

    let reloaded: Awaited<ReturnType<SourceBackedDocumentsApi['reloadSourceBackedDocument']>>;
    await act(async () => { reloaded = session.current().reloadSourceBackedDocument(KEY); });
    expect(reloaded).toEqual(expect.objectContaining({ type: 'document-reloaded', previousText: 'local\n' }));
    expect(session.current().getSourceBackedDocument(KEY)?.currentText).toBe('external\n');

    await act(async () => { session.current().updateSourceBackedDocumentText(KEY, 'local again\n'); });
    let discarded: Awaited<ReturnType<SourceBackedDocumentsApi['discardSourceBackedDocumentEdits']>>;
    await act(async () => { discarded = session.current().discardSourceBackedDocumentEdits(KEY); });
    expect(discarded).toEqual(expect.objectContaining({ type: 'document-discarded', previousText: 'local again\n' }));
    expect(session.current().getSourceBackedDocument(KEY)?.currentText).toBe('external\n');

    await session.unmount();
  });
});
