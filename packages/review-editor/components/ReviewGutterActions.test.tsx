import { afterEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  createReviewGutterActionsElement,
  ReviewGutterActions,
  type HoveredDiffLine,
} from './ReviewGutterActions';
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
    const wrapper = session.host.querySelector('[data-testid="review-gutter-actions"]') as HTMLElement;

    expect(comment!.getAttribute('data-gutter-size')).toBe('1lh');
    expect(ai!.getAttribute('data-gutter-size')).toBe('1lh');
    expect(wrapper.style.width).toBe('calc(2lh + 2px)');
    expect(wrapper.style.marginLeft).toBe('calc(-1lh - 2px)');

    await session.rerender({ aiAvailable: false });
    const compactWrapper = session.host.querySelector('[data-testid="review-gutter-actions"]') as HTMLElement;
    expect(session.buttons()).toHaveLength(1);
    expect(session.buttons()[0]!.textContent).toBe('+');
    expect(session.buttons()[0]!.getAttribute('data-gutter-size')).toBe('1lh');
    expect(compactWrapper.style.width).toBe('calc(1lh)');
    expect(compactWrapper.style.marginLeft).toBe('calc(0px)');

    await session.unmount();
  });

  test.skipIf(!hasDom)('uses rerendered hovered-line getter and callbacks', async () => {
    const firstComments: SelectedLineRange[] = [];
    const secondComments: SelectedLineRange[] = [];
    const firstAiLines: HoveredDiffLine[] = [];
    const secondAiLines: HoveredDiffLine[] = [];
    const session = await mountActions({
      getHoveredLine: () => ({ lineNumber: 3, side: 'additions' }),
      onComment: (range) => firstComments.push(range),
      onAttachAI: (line) => firstAiLines.push(line),
    });

    await session.rerender({
      getHoveredLine: () => ({ lineNumber: 4, side: 'deletions' }),
      onComment: (range) => secondComments.push(range),
      onAttachAI: (line) => secondAiLines.push(line),
    });

    const [comment, ai] = session.buttons();
    await act(async () => comment!.click());
    await act(async () => ai!.click());

    expect(firstComments).toEqual([]);
    expect(firstAiLines).toEqual([]);
    expect(secondComments).toEqual([{ start: 4, end: 4, side: 'deletions' }]);
    expect(secondAiLines).toEqual([{ lineNumber: 4, side: 'deletions' }]);

    await session.unmount();
  });

  test.skipIf(!hasDom)('keeps comment and AI callbacks independent from parent clicks', async () => {
    let parentClicks = 0;
    const comments: SelectedLineRange[] = [];
    const aiLines: HoveredDiffLine[] = [];
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    let root!: Root;

    await act(async () => {
      root = createRoot(wrapper);
      root.render(
        <div onClick={() => { parentClicks += 1; }}>
          <ReviewGutterActions
            getHoveredLine={() => ({ lineNumber: 8, side: 'additions' })}
            aiAvailable
            onComment={(range) => comments.push(range)}
            onAttachAI={(line) => aiLines.push(line)}
          />
        </div>,
      );
    });

    const buttons = Array.from(wrapper.querySelectorAll('button')) as HTMLButtonElement[];
    await act(async () => buttons[0]!.click());
    expect(comments).toEqual([{ start: 8, end: 8, side: 'additions' }]);
    expect(aiLines).toEqual([]);
    expect(parentClicks).toBe(0);

    await act(async () => buttons[1]!.click());
    expect(comments).toHaveLength(1);
    expect(aiLines).toEqual([{ lineNumber: 8, side: 'additions' }]);
    expect(parentClicks).toBe(0);

    await act(async () => root.unmount());
    wrapper.remove();
  });

  test.skipIf(!hasDom)('creates a DOM gutter element for Pierre CodeView options', () => {
    const comments: SelectedLineRange[] = [];
    const aiLines: HoveredDiffLine[] = [];
    const element = createReviewGutterActionsElement({
      getHoveredLine: () => ({ lineNumber: 13, side: 'deletions' }),
      aiAvailable: true,
      onComment: (range) => comments.push(range),
      onAttachAI: (line) => aiLines.push(line),
    });

    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.style.width).toBe('calc(2lh + 2px)');
    expect(element.style.marginLeft).toBe('calc(-1lh - 2px)');

    const buttons = Array.from(element.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.dataset.gutterSize).toBe('1lh');
    expect(buttons[1]!.getAttribute('aria-label')).toBe('Attach line to AI chat');

    buttons[0]!.click();
    buttons[1]!.click();

    expect(comments).toEqual([{ start: 13, end: 13, side: 'deletions' }]);
    expect(aiLines).toEqual([{ lineNumber: 13, side: 'deletions' }]);
  });
});
