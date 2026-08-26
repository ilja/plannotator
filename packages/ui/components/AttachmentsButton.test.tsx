import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Schema } from 'effect';
import type { ImageAttachment } from '../types';
import { AttachmentsButton } from './AttachmentsButton';

const hasDom = process.env.DOM_TESTS === '1';
const realFetch = globalThis.fetch;
const realCreateObjectURL = URL.createObjectURL;
const realRevokeObjectURL = URL.revokeObjectURL;
const roots: Root[] = [];
const containers: HTMLElement[] = [];
let objectUrlSequence = 0;

function installFetchResponses(responses: Response[]): void {
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => {
      const response = responses.shift();
      if (!response) throw new Error('Unexpected fetch call');
      return response;
    },
    { preconnect: (): void => {} },
  );
}

function imageResponse(): Response {
  return new Response(new Blob(['image'], { type: 'image/png' }));
}

type JsonResponseBody = Schema.Schema.Type<typeof Schema.Json>;

function uploadResponse(body: JsonResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function renderAttachments(
  images: ImageAttachment[],
  onAdd: (image: ImageAttachment) => void,
  onRemove: (path: string) => void,
): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);

  await act(async () => {
    root.render(
      <AttachmentsButton
        images={images}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    );
  });
}

function attachmentButton(): HTMLButtonElement {
  const button = document.querySelector('button[aria-label="Attachments"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error('Attachments button not found');
  return button;
}

async function openAnnotatorFromFile(): Promise<void> {
  await act(async () => attachmentButton().click());

  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('File input not found');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['image'], 'source.png', { type: 'image/png' })],
  });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));

  const image = document.querySelector('img[alt="Annotate"]');
  if (!(image instanceof HTMLImageElement)) throw new Error('Annotator image not found');
  await act(async () => image.dispatchEvent(new Event('load')));
}

async function openAnnotatorForExistingImage(): Promise<void> {
  await act(async () => attachmentButton().click());

  const image = document.querySelector('[data-popover-layer] img');
  if (!(image instanceof HTMLImageElement)) throw new Error('Existing attachment image not found');
  await act(async () => image.click());

  const annotatorImage = document.querySelector('img[alt="Annotate"]');
  if (!(annotatorImage instanceof HTMLImageElement)) throw new Error('Annotator image not found');
  await act(async () => annotatorImage.dispatchEvent(new Event('load')));
}

async function acceptAnnotator(): Promise<void> {
  const saveButton = document.querySelector('button[title="Save (Esc)"]');
  if (!(saveButton instanceof HTMLButtonElement)) throw new Error('Annotator save button not found');

  await act(async () => {
    saveButton.click();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  for (const container of containers.splice(0)) container.remove();

  globalThis.fetch = realFetch;
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  document.body.innerHTML = '';
});

describe('AttachmentsButton upload response handling', () => {
  test.skipIf(!hasDom)('adds a valid upload response and ignores extra fields', async () => {
    const added: ImageAttachment[] = [];
    const removed: string[] = [];
    installFetchResponses([
      imageResponse(),
      uploadResponse({ path: '/uploads/new.png', originalName: 'source.png' }),
    ]);
    URL.createObjectURL = () => `blob:attachment-test-${++objectUrlSequence}`;
    URL.revokeObjectURL = () => {};

    await renderAttachments([], image => added.push(image), path => removed.push(path));
    await openAnnotatorFromFile();
    await acceptAnnotator();

    expect(added).toEqual([{ path: '/uploads/new.png', name: 'source' }]);
    expect(removed).toEqual([]);
  });

  test.skipIf(!hasDom)('does not call attachment callbacks for invalid JSON', async () => {
    const added: ImageAttachment[] = [];
    const removed: string[] = [];
    installFetchResponses([imageResponse(), new Response('not json')]);
    URL.createObjectURL = () => `blob:attachment-test-${++objectUrlSequence}`;
    URL.revokeObjectURL = () => {};

    await renderAttachments([], image => added.push(image), path => removed.push(path));
    await openAnnotatorFromFile();
    await acceptAnnotator();

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  test.skipIf(!hasDom)('does not call attachment callbacks for a malformed response body', async () => {
    const added: ImageAttachment[] = [];
    const removed: string[] = [];
    installFetchResponses([imageResponse(), uploadResponse({ path: 42 })]);
    URL.createObjectURL = () => `blob:attachment-test-${++objectUrlSequence}`;
    URL.revokeObjectURL = () => {};

    await renderAttachments([], image => added.push(image), path => removed.push(path));
    await openAnnotatorFromFile();
    await acceptAnnotator();

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  test.skipIf(!hasDom)('does not call attachment callbacks for a non-OK error envelope', async () => {
    const added: ImageAttachment[] = [];
    const removed: string[] = [];
    installFetchResponses([imageResponse(), uploadResponse({ error: 'Upload failed' }, 500)]);
    URL.createObjectURL = () => `blob:attachment-test-${++objectUrlSequence}`;
    URL.revokeObjectURL = () => {};

    await renderAttachments([], image => added.push(image), path => removed.push(path));
    await openAnnotatorFromFile();
    await acceptAnnotator();

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  test.skipIf(!hasDom)('accepts a valid path from a non-OK response', async () => {
    const added: ImageAttachment[] = [];
    const removed: string[] = [];
    installFetchResponses([imageResponse(), uploadResponse({ path: '/uploads/non-ok.png' }, 500)]);
    URL.createObjectURL = () => `blob:attachment-test-${++objectUrlSequence}`;
    URL.revokeObjectURL = () => {};

    await renderAttachments([], image => added.push(image), path => removed.push(path));
    await openAnnotatorFromFile();
    await acceptAnnotator();

    expect(added).toEqual([{ path: '/uploads/non-ok.png', name: 'source' }]);
    expect(removed).toEqual([]);
  });

  test.skipIf(!hasDom)('only removes an existing attachment after a valid re-edit upload', async () => {
    const added: ImageAttachment[] = [];
    const removed: string[] = [];
    installFetchResponses([
      imageResponse(),
      uploadResponse({ path: '/uploads/re-edited.png' }),
    ]);

    await renderAttachments(
      [{ path: 'https://example.test/original.png', name: 'original' }],
      image => added.push(image),
      path => removed.push(path),
    );
    await openAnnotatorForExistingImage();
    await acceptAnnotator();

    expect(removed).toEqual(['https://example.test/original.png']);
    expect(added).toEqual([{ path: '/uploads/re-edited.png', name: 'original' }]);
  });

  test.skipIf(!hasDom)('keeps an existing attachment when a re-edit response is malformed', async () => {
    const added: ImageAttachment[] = [];
    const removed: string[] = [];
    installFetchResponses([imageResponse(), uploadResponse({ error: 'Upload failed' }, 500)]);

    await renderAttachments(
      [{ path: 'https://example.test/original.png', name: 'original' }],
      image => added.push(image),
      path => removed.push(path),
    );
    await openAnnotatorForExistingImage();
    await acceptAnnotator();

    expect(removed).toEqual([]);
    expect(added).toEqual([]);
  });
});
