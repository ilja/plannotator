import { afterEach, describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { saveBearSettings } from '../utils/bear';
import { saveObsidianSettings } from '../utils/obsidian';
import { saveOctarineSettings } from '../utils/octarine';
import { ExportModal } from './ExportModal';

const hasDom = globalThis.document !== undefined;
const realFetch = globalThis.fetch;
const roots: Root[] = [];
type JsonResponseBody = Schema.Schema.Type<typeof Schema.Json>;

if (hasDom) window.location.href = 'http://localhost';

function installSaveNotesFetch(body: JsonResponseBody, status = 200): void {
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
    { preconnect: (): void => {} },
  );
}

function installInvalidSaveNotesJson(): void {
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => new Response('not json'),
    { preconnect: (): void => {} },
  );
}

function saveButton(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === 'Save',
  );
  if (button === undefined) throw new Error('Export modal save button not found');
  return button;
}

async function renderExportModal(): Promise<void> {
  saveObsidianSettings({
    enabled: true,
    vaultPath: '/notes',
    folder: 'plannotator',
    customPath: undefined,
    filenameFormat: undefined,
    filenameSeparator: 'space',
    autoSave: false,
    vaultBrowserEnabled: false,
  });
  saveBearSettings({ enabled: false, customTags: '', tagPosition: 'append', autoSave: false });
  saveOctarineSettings({ enabled: false, workspace: '', folder: 'plannotator', autoSave: false });

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);

  await act(async () => {
    root.render(
      <ExportModal
        isOpen
        onClose={() => {}}
        shareUrl=""
        shareUrlSize="0 B"
        annotationsOutput=""
        annotationCount={0}
        sharingEnabled={false}
        markdown="# Plan"
        isApiMode
        initialTab="notes"
      />,
    );
  });
}

async function saveToObsidian(): Promise<void> {
  await act(async () => {
    saveButton().click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  globalThis.fetch = realFetch;

  if (hasDom) {
    document.body.innerHTML = '';
    saveObsidianSettings({
      enabled: false,
      vaultPath: '',
      folder: 'plannotator',
      customPath: undefined,
      filenameFormat: undefined,
      filenameSeparator: 'space',
      autoSave: false,
      vaultBrowserEnabled: false,
    });
    saveBearSettings({ enabled: false, customTags: '', tagPosition: 'append', autoSave: false });
    saveOctarineSettings({ enabled: false, workspace: '', folder: 'plannotator', autoSave: false });
  }
});

describe('ExportModal save-notes response handling', () => {
  test.skipIf(!hasDom)('shows the existing Save failed error when the selected result is missing', async () => {
    installSaveNotesFetch({ results: {} });
    await renderExportModal();

    await saveToObsidian();

    expect(document.body.textContent).toContain('Failed');
    expect(document.body.textContent).toContain('Save failed');
  });

  test.skipIf(!hasDom)('shows the existing Save failed error when the selected result is malformed', async () => {
    installSaveNotesFetch({ results: { obsidian: { success: true, path: 42 } } });
    await renderExportModal();

    await saveToObsidian();

    expect(document.body.textContent).toContain('Failed');
    expect(document.body.textContent).toContain('Save failed');
  });

  test.skipIf(!hasDom)('uses a valid selected result even when the response status is not OK', async () => {
    installSaveNotesFetch({ results: { obsidian: { success: true } } }, 500);
    await renderExportModal();

    await saveToObsidian();

    expect(document.body.textContent).toContain('Saved');
  });

  test.skipIf(!hasDom)('shows the existing Save failed error when the response is not valid JSON', async () => {
    installInvalidSaveNotesJson();
    await renderExportModal();

    await saveToObsidian();

    expect(document.body.textContent).toContain('Failed');
    expect(document.body.textContent).toContain('Save failed');
  });
});
