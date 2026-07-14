import { afterEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { ReviewGutterActions, type HoveredDiffLine } from './ReviewGutterActions';
import type { SelectedLineRange } from '@plannotator/ui/types';

const hasDom = typeof document !== 'undefined';

type Props = React.ComponentProps<typeof ReviewGutterActions>;

async function mountActions(overrides: Partial<Props> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root!: Root;
  const props: Props = {
    getHoveredLine: () => ({ lineNumber: 7, side: 'additions' }),
    aiAvailable: true,
    onComment: () => {},
    onAttachAI: () => {},
    ...overrides,
  };

  await act(async () => {
    root = createRoot(host);
    root.render(<ReviewGutterActions {...props} />);
  });

  return {
    host,
    buttons: () => Array.from(host.querySelectorAll('button')) as HTMLButtonElement[],
    rerender: async (nextOverrides: Partial<Props> = {}) => {
      Object.assign(props, nextOverrides);
      await act(async () => root.render(<ReviewGutterActions {...props} />));
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

afterEach(() => {
  if (hasDom) document.body.innerHTML = '';
});

describe('ReviewGutterActions', () => {
  test.skipIf(!hasDom)('dispatches comment and AI actions from the hovered line at click time', async () => {
    let currentLine: HoveredDiffLine | undefined = { lineNumber: 7, side: 'additions' };
    const comments: SelectedLineRange[] = [];
    const aiLines: HoveredDiffLine[] = [];
    const session = await mountActions({
      getHoveredLine: () => currentLine,
      onComment: (range) => comments.push(range),
      onAttachAI: (line) => aiLines.push(line),
    });

    currentLine = { lineNumber: 9, side: 'deletions' };
    await act(async () => session.buttons()[0]!.click());
    expect(comments).toEqual([{ start: 9, end: 9, side: 'deletions' }]);
    expect(aiLines).toEqual([]);

    currentLine = { lineNumber: 11, side: 'additions' };
    await act(async () => session.buttons()[1]!.click());
    expect(aiLines).toEqual([{ lineNumber: 11, side: 'additions' }]);
    expect(comments).toHaveLength(1);

    await session.unmount();
  });

  test.skipIf(!hasDom)('does nothing when no hovered line is available', async () => {
    let comments = 0;
    let ai = 0;
    const session = await mountActions({
      getHoveredLine: () => undefined,
      onComment: () => { comments += 1; },
      onAttachAI: () => { ai += 1; },
    });

    await act(async () => {
      for (const button of session.buttons()) button.click();
    });

    expect(comments).toBe(0);
    expect(ai).toBe(0);

    await session.unmount();
  });

  test.skipIf(!hasDom)('stops click propagation', async () => {
    let parentClicks = 0;
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    let root!: Root;

    await act(async () => {
      root = createRoot(wrapper);
      root.render(
        <div onClick={() => { parentClicks += 1; }}>
          <ReviewGutterActions
            getHoveredLine={() => ({ lineNumber: 7, side: 'additions' })}
            aiAvailable
            onComment={() => {}}
            onAttachAI={() => {}}
          />
        </div>,
      );
    });

    const buttons = Array.from(wrapper.querySelectorAll('button')) as HTMLButtonElement[];
    await act(async () => buttons[0]!.click());
    await act(async () => buttons[1]!.click());
    expect(parentClicks).toBe(0);

    await act(async () => root.unmount());
    wrapper.remove();
  });

  test.skipIf(!hasDom)('hides sparkle when AI is unavailable and keeps same-size buttons', async () => {
    const session = await mountActions({ aiAvailable: true });
    const [comment, ai] = session.buttons();

    expect(comment!.getAttribute('data-gutter-size')).toBe('1lh');
    expect(ai!.getAttribute('data-gutter-size')).toBe('1lh');

    await session.rerender({ aiAvailable: false });
    expect(session.buttons()).toHaveLength(1);
    expect(session.buttons()[0]!.textContent).toBe('+');
    expect(session.buttons()[0]!.getAttribute('data-gutter-size')).toBe('1lh');

    await session.unmount();
  });
});
