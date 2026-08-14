import { afterEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  useSourceBackedDocuments,
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

async function mountSourceBackedDocuments(): Promise<{
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
    latest = useSourceBackedDocuments();
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
    const session = await mountSourceBackedDocuments();
    const initialSource = { ...SOURCE_A };

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: initialSource });
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
      session.current().reconcileDiskSnapshot({
        key: KEY,
        text: 'external\n',
        sourceSave: SOURCE_EXTERNAL,
      });
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

    let discarded: ReturnType<SourceBackedDocumentsApi['discardSourceBackedDocument']> = null;
    await act(async () => {
      discarded = session.current().discardSourceBackedDocument(KEY);
    });

    expect(discarded?.currentText).toBe('a\n');
    expect(discarded?.diskBaseline).toBe('a\n');
    expect(discarded?.saveStatus).toBe('clean');
    expect(session.current().getSourceBackedDocument(KEY)?.currentText).toBe('a\n');
    expect(session.current().getUnsavedSourceBackedDocuments()).toEqual([]);

    await session.unmount();
  });
});

describe('useSourceBackedDocuments conflict actions', () => {
  test.skipIf(!hasDom)('overwrite conflict records the diff from the latest disk version', async () => {
    const session = await mountSourceBackedDocuments();

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'b\n', sourceSave: SOURCE_B });
      session.current().beginSourceBackedDocumentEdit(KEY, 'b\n');
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
      session.current().reconcileDiskSnapshot({
        key: KEY,
        text: 'external\n',
        sourceSave: SOURCE_EXTERNAL,
      });
    });

    expect(session.current().getSourceBackedDocument(KEY)?.diskConflict?.sourceSave.hash).toBe('sha256:external');

    await act(async () => {
      session.current().saveSourceBackedDocument({
        key: KEY,
        text: 'local\n',
        sourceSave: SOURCE_OVERWRITE,
        savedChangeBaseText: 'external\n',
        savedChangeBaseHash: 'sha256:external',
      });
    });

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
    const session = await mountSourceBackedDocuments();

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'b\n', sourceSave: SOURCE_B });
      session.current().beginSourceBackedDocumentEdit(KEY, 'b\n');
      session.current().updateSourceBackedDocumentText(KEY, 'local\n');
      session.current().reconcileDiskSnapshot({
        key: KEY,
        text: 'external\n',
        sourceSave: SOURCE_EXTERNAL,
      });
    });

    await act(async () => {
      session.current().reloadSourceBackedDocumentConflict(KEY);
    });

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
    const session = await mountSourceBackedDocuments();

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().beginSourceBackedDocumentEdit(KEY, 'a\n');
      session.current().updateSourceBackedDocumentText(KEY, 'b\n');
      session.current().saveSourceBackedDocument({ key: KEY, text: 'b\n', sourceSave: SOURCE_B });
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
    const session = await mountSourceBackedDocuments();

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().updateSourceBackedDocumentText(KEY, 'b\n');
      session.current().saveSourceBackedDocument({ key: KEY, text: 'b\n', sourceSave: SOURCE_B });
    });

    await act(async () => {
      session.current().markSourceBackedDocumentMissing(KEY);
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
    const session = await mountSourceBackedDocuments();

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().markSourceBackedDocumentMissing(KEY);
      session.current().saveSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_B });
    });

    const doc = session.current().getSourceBackedDocument(KEY);
    expect(doc?.saveStatus).toBe('saved');
    expect(doc?.missingOnDisk).toBeUndefined();
    expect(doc?.error).toBeUndefined();

    await session.unmount();
  });

  test.skipIf(!hasDom)('discarding a missing source file removes the in-memory buffer', async () => {
    const session = await mountSourceBackedDocuments();

    await act(async () => {
      session.current().openSourceBackedDocument({ key: KEY, text: 'a\n', sourceSave: SOURCE_A });
      session.current().markSourceBackedDocumentMissing(KEY);
      session.current().discardSourceBackedDocument(KEY);
    });

    expect(session.current().getSourceBackedDocument(KEY)).toBeNull();
    expect(session.current().getSourceBackedDocument(KEY)).toBeNull();
    expect(session.current().getUnsavedSourceBackedDocuments()).toEqual([]);

    await session.unmount();
  });
});
