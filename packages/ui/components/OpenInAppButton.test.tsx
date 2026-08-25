import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Schema } from 'effect';
import { OpenInAppButton } from './OpenInAppButton';

const hasDom = process.env.DOM_TESTS === '1';
const realFetch = globalThis.fetch;
const roots: Root[] = [];
const containers: HTMLElement[] = [];

const appsResponse = {
  available: true,
  apps: [
    { id: 'reveal', label: 'Finder', kind: 'file-manager', icon: 'finder' },
  ],
};

type JsonResponseBody = Schema.Schema.Type<typeof Schema.Json>;

function jsonResponse(body: JsonResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetchResponses(
  postResponse: Response | Promise<Response> | null,
  appResponse: JsonResponseBody = appsResponse,
): void {
  globalThis.fetch = Object.assign(
    async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (init?.method === 'POST') {
        if (postResponse) return postResponse;
        throw new Error('Unexpected POST fetch call');
      }
      return jsonResponse(appResponse);
    },
    { preconnect: (): void => {} },
  );
}

async function renderOpenInAppButton(): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);

  await act(async () => {
    root.render(<OpenInAppButton filePath="/tmp/example.ts" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function primaryOpenButton(): HTMLButtonElement {
  const button = document.querySelector('button[aria-label^="Open in "]');
  if (!(button instanceof HTMLButtonElement)) throw new Error('Open-in primary button not found');
  return button;
}

async function clickPrimaryOpenButton(): Promise<void> {
  await act(async () => {
    primaryOpenButton().click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function renderedError(): string | null {
  return document.querySelector('[role="status"]')?.textContent ?? null;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  for (const container of containers.splice(0)) container.remove();

  globalThis.fetch = realFetch;
  document.body.innerHTML = '';
});

describe('OpenInAppButton response validation', () => {
  test.skipIf(!hasDom)('renders only valid apps from a mixed response in grouped order', async () => {
    installFetchResponses(null, {
      available: true,
      apps: [
        { id: 'terminal', label: 'Terminal', kind: 'terminal', icon: 'terminal' },
        { id: 'bad', label: 'Bad', kind: 'editor', icon: 42 },
        { id: 'vscode', label: 'VS Code', kind: 'editor', icon: 'vscode' },
        { id: 'reveal', label: 'Finder', kind: 'file-manager', icon: 'finder' },
      ],
    });

    await renderOpenInAppButton();

    const trigger = document.querySelector('button[aria-label="Choose app to open in"]');
    if (!(trigger instanceof HTMLButtonElement)) throw new Error('Open-in menu trigger not found');
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      trigger.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
      trigger.click();
    });

    const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .map((item) => item.textContent?.trim())
      .filter((label): label is string => label !== undefined);

    expect(menuItems.slice(0, 3)).toEqual(['Finder', 'VS Code', 'Terminal']);
    expect(menuItems).not.toContain('Bad');
  });

  test.skipIf(!hasDom)('accepts a valid success response and releases the busy state', async () => {
    let resolvePost = (_response: Response): void => {};
    const postResponse = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
    installFetchResponses(postResponse);

    await renderOpenInAppButton();
    const button = primaryOpenButton();
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(button.disabled).toBeTrue();

    await act(async () => {
      resolvePost(jsonResponse({ ok: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(button.disabled).toBeFalse();
    expect(renderedError()).toBeNull();
  });

  test.skipIf(!hasDom)('renders a validated failure error', async () => {
    installFetchResponses(jsonResponse({ ok: false, error: 'Permission denied' }));

    await renderOpenInAppButton();
    await clickPrimaryOpenButton();

    expect(renderedError()).toBe('Permission denied');
  });

  test.skipIf(!hasDom)('uses the fallback for a malformed success envelope', async () => {
    installFetchResponses(jsonResponse({ ok: 'true' }));

    await renderOpenInAppButton();
    await clickPrimaryOpenButton();

    expect(renderedError()).toBe('Failed to open');
  });

  test.skipIf(!hasDom)('uses the fallback for an empty validated failure error', async () => {
    installFetchResponses(jsonResponse({ ok: false, error: '' }));

    await renderOpenInAppButton();
    await clickPrimaryOpenButton();

    expect(renderedError()).toBe('Failed to open');
  });

  test.skipIf(!hasDom)('uses the fallback for malformed failure envelopes', async () => {
    installFetchResponses(jsonResponse({ ok: false, error: 42 }));

    await renderOpenInAppButton();
    await clickPrimaryOpenButton();

    expect(renderedError()).toBe('Failed to open');
  });

  test.skipIf(!hasDom)('uses the fallback for invalid JSON', async () => {
    installFetchResponses(new Response('not json'));

    await renderOpenInAppButton();
    await clickPrimaryOpenButton();

    expect(renderedError()).toBe('Failed to open');
  });

  test.skipIf(!hasDom)('uses the fallback for non-OK responses', async () => {
    const response = jsonResponse({ ok: false, error: 'Do not trust this body' }, 500);
    response.json = async () => {
      throw new Error('Non-OK response body should not be parsed');
    };
    installFetchResponses(response);

    await renderOpenInAppButton();
    await clickPrimaryOpenButton();

    expect(renderedError()).toBe('Failed to open');
  });
});
