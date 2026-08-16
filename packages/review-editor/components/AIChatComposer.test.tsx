import { afterEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { AIChatComposer } from './AIChatComposer';
import type { PendingAIContext } from '../utils/pendingAIContext';

const hasDom = typeof document !== 'undefined';

const context: PendingAIContext = {
  filePath: 'src/example.ts',
  lineStart: 3,
  lineEnd: 3,
  side: 'new',
  selectedCode: 'const next = true;',
};

type Props = React.ComponentProps<typeof AIChatComposer>;

async function mountComposer(overrides: Partial<Props> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root!: Root;
  const props: Props = {
    value: '',
    pendingContext: null,
    focusToken: 0,
    disabled: false,
    onChange: () => {},
    onSubmit: () => {},
    onRemoveContext: () => {},
    ...overrides,
  };

  await act(async () => {
    root = createRoot(host);
    root.render(<AIChatComposer {...props} />);
  });

  return {
    host,
    textarea: host.querySelector('textarea')!,
    rerender: async (nextOverrides: Partial<Props> = {}) => {
      Object.assign(props, nextOverrides);
      await act(async () => {
        root.render(<AIChatComposer {...props} />);
      });
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function changeText(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
}

afterEach(() => {
  if (hasDom) document.body.innerHTML = '';
});

describe('AIChatComposer', () => {
  test.skipIf(!hasDom)('renders removable metadata-only pending context', async () => {
    let removed = false;
    const session = await mountComposer({
      pendingContext: context,
      onRemoveContext: () => { removed = true; },
    });

    expect(session.host.textContent).toContain('example.ts');
    expect(session.host.textContent).toContain('Line 3');
    expect(session.host.textContent).not.toContain('const next = true;');

    const remove = session.host.querySelector('button[aria-label="Remove AI context"]') as HTMLButtonElement;
    await act(async () => remove.click());
    expect(removed).toBe(true);

    await session.unmount();
  });

  test.skipIf(!hasDom)('focuses on mount and when the focus token changes', async () => {
    const session = await mountComposer({ focusToken: 1 });
    expect(document.activeElement).toBe(session.textarea);

    session.textarea.blur();
    expect(document.activeElement).not.toBe(session.textarea);

    await session.rerender({ focusToken: 2 });
    expect(document.activeElement).toBe(session.textarea);

    await session.unmount();
  });

  test.skipIf(!hasDom)('reports input changes and submits with Cmd/Ctrl+Enter', async () => {
    const changes: string[] = [];
    let submitted = 0;
    const session = await mountComposer({
      value: 'Why?',
      onChange: (value) => changes.push(value),
      onSubmit: () => { submitted += 1; },
    });

    await act(async () => changeText(session.textarea, 'Why now?'));
    expect(changes).toEqual(['Why now?']);

    await act(async () => {
      session.textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      }));
    });
    expect(submitted).toBe(1);

    await session.unmount();
  });

  test.skipIf(!hasDom)('disables textarea and send button while streaming', async () => {
    const session = await mountComposer({ value: 'Question', disabled: true });

    expect(session.textarea.disabled).toBe(true);
    const send = session.host.querySelector('button[title^="Send"]') as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    await session.unmount();
  });

  test.skipIf(!hasDom)('replaces pending context on rerender', async () => {
    const session = await mountComposer({ pendingContext: context, value: 'Attached?' });
    expect(session.host.querySelector('textarea')?.value).toBe('Attached?');
    expect(session.host.textContent).toContain('Line 3');
    expect(session.host.textContent).toContain('example.ts');

    await session.rerender({
      pendingContext: {
        filePath: 'src/other.ts',
        lineStart: 9,
        lineEnd: 11,
        side: 'old',
        selectedCode: 'removed();',
      },
    });

    expect(session.host.textContent).not.toContain('example.ts');
    expect(session.host.textContent).toContain('other.ts');
    expect(session.host.textContent).toContain('Lines 9-11');
    expect(session.host.textContent).not.toContain('removed();');

    await session.unmount();
  });

  test.skipIf(!hasDom)('uses the same composer for attached submit and plain follow-up', async () => {
    const submissions: string[] = [];
    const session = await mountComposer({
      pendingContext: context,
      value: 'Attached?',
      onSubmit: () => submissions.push('submit'),
    });

    const send = session.host.querySelector('button[title^="Send"]') as HTMLButtonElement;
    await act(async () => send.click());
    expect(submissions).toEqual(['submit']);

    await session.rerender({ pendingContext: null, value: 'General?' });
    expect(session.host.querySelector('textarea')?.value).toBe('General?');
    expect(session.host.textContent).not.toContain('Line 3');

    await act(async () => send.click());
    expect(submissions).toEqual(['submit', 'submit']);

    await session.unmount();
  });
});
