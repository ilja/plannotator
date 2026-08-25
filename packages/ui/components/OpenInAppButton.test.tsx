import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OpenInAppButton } from './OpenInAppButton';

const hasDom = process.env.DOM_TESTS === '1';
const realFetch = globalThis.fetch;
const roots: Root[] = [];
const containers: HTMLElement[] = [];

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
    globalThis.fetch = Object.assign(
      async () => new Response(JSON.stringify({
        available: true,
        apps: [
          { id: 'terminal', label: 'Terminal', kind: 'terminal', icon: 'terminal' },
          { id: 'bad', label: 'Bad', kind: 'editor', icon: 42 },
          { id: 'vscode', label: 'VS Code', kind: 'editor', icon: 'vscode' },
          { id: 'reveal', label: 'Finder', kind: 'file-manager', icon: 'finder' },
        ],
      })),
      { preconnect: (): void => {} },
    );

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
});
