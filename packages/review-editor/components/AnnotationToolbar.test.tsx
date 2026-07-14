import { afterEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AnnotationToolbar } from './AnnotationToolbar';
import type { ToolbarState } from '../hooks/useAnnotationToolbar';

const hasDom = typeof document !== 'undefined';

type Props = React.ComponentProps<typeof AnnotationToolbar>;

const lineToolbarState: ToolbarState = {
  position: { top: 120, left: 240 },
  range: { start: 3, end: 5, side: 'additions' },
};

const tokenToolbarState: ToolbarState = {
  position: { top: 120, left: 240 },
  range: { start: 8, end: 8, side: 'deletions' },
  tokenSelection: {
    anchor: {
      lineNumber: 8,
      charStart: 2,
      charEnd: 10,
      tokenText: 'example',
      side: 'deletions',
    },
    fullText: 'exampleToken',
  },
};

async function mountToolbar(overrides: Partial<Props> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root!: Root;
  const props: Props = {
    toolbarState: lineToolbarState,
    toolbarRef: React.createRef<HTMLDivElement>(),
    commentText: '',
    setCommentText: () => {},
    suggestedCode: '',
    setSuggestedCode: () => {},
    showSuggestedCode: false,
    setShowSuggestedCode: () => {},
    selectedOriginalCode: 'const original = true;',
    isEditing: false,
    setShowCodeModal: () => {},
    onSubmit: () => {},
    onDismiss: () => {},
    onCancel: () => {},
    conventionalCommentsEnabled: true,
    conventionalLabel: null,
    onConventionalLabelChange: () => {},
    decorations: [],
    onDecorationsChange: () => {},
    enabledLabels: [
      {
        label: 'suggestion',
        display: 'suggestion',
        tone: 'info',
        showBlockingToggle: true,
        hint: 'Proposes an improvement',
      },
    ],
    ...overrides,
  };

  await act(async () => {
    root = createRoot(host);
    root.render(<AnnotationToolbar {...props} />);
  });

  return {
    host,
    get body() {
      return document.body;
    },
    rerender: async (nextOverrides: Partial<Props> = {}) => {
      Object.assign(props, nextOverrides);
      await act(async () => root.render(<AnnotationToolbar {...props} />));
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

describe('AnnotationToolbar', () => {
  test.skipIf(!hasDom)('create mode renders comment controls without Ask AI', async () => {
    const session = await mountToolbar({ commentText: 'Please explain this.' });

    expect(session.body.textContent).toContain('Lines 3-5');
    expect(session.body.textContent).toContain('suggestion');
    expect(session.body.textContent).toContain('Add suggested code');
    expect(session.body.textContent).toContain('Add Comment');
    expect(session.body.textContent).not.toContain('Ask AI');
    expect(session.body.querySelector('textarea')?.getAttribute('placeholder')).toBe('Leave feedback...');

    await session.unmount();
  });

  test.skipIf(!hasDom)('edit mode renders Update', async () => {
    const session = await mountToolbar({ isEditing: true, commentText: 'Updated note' });

    expect(session.body.textContent).toContain('Edit annotation');
    expect(session.body.textContent).toContain('Update');
    expect(session.body.textContent).not.toContain('Add Comment');
    expect(session.body.textContent).not.toContain('Ask AI');

    await session.unmount();
  });

  test.skipIf(!hasDom)('renders range and token metadata', async () => {
    const session = await mountToolbar();
    expect(session.body.textContent).toContain('Lines 3-5');

    await session.rerender({ toolbarState: tokenToolbarState });
    expect(session.body.textContent).toContain('exampleToken');
    expect(session.body.textContent).not.toContain('Ask AI');

    await session.unmount();
  });

  test.skipIf(!hasDom)('submits comments from primary button and Cmd/Ctrl+Enter', async () => {
    let submitted = 0;
    const changes: string[] = [];
    const session = await mountToolbar({
      commentText: 'Ready',
      setCommentText: (value) => changes.push(value),
      onSubmit: () => { submitted += 1; },
    });

    const textarea = session.body.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => changeText(textarea, 'Ready now'));
    expect(changes).toEqual(['Ready now']);

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      }));
    });
    expect(submitted).toBe(1);

    const addButton = Array.from(session.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Add Comment'),
    ) as HTMLButtonElement;
    await act(async () => addButton.click());
    expect(submitted).toBe(2);

    await session.unmount();
  });
});
