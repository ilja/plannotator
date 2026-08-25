import { describe, expect, it } from 'bun:test';
import { CONVENTIONAL_LABELS, getEnabledLabels } from './ConventionalLabelPicker';

describe('getEnabledLabels', () => {
  it('returns all defaults for null or empty config', () => {
    expect(getEnabledLabels(null)).toHaveLength(9);
    expect(getEnabledLabels('')).toHaveLength(9);
  });

  it('returns all defaults for invalid JSON', () => {
    expect(getEnabledLabels('not json')).toEqual(CONVENTIONAL_LABELS);
  });

  it('returns all defaults for a non-array value', () => {
    expect(getEnabledLabels('{"label":"suggestion"}')).toEqual(CONVENTIONAL_LABELS);
  });

  it('preserves an explicitly empty label list', () => {
    expect(getEnabledLabels('[]')).toEqual([]);
  });

  it('builds label defs from the config, merging built-in tone and hint', () => {
    const labels = getEnabledLabels(
      JSON.stringify([{ label: 'suggestion', display: 'suggestion', blocking: true }]),
    );
    expect(labels).toHaveLength(1);
    expect(labels[0]).toEqual({
      label: 'suggestion',
      display: 'suggestion',
      tone: 'info',
      showBlockingToggle: true,
      hint: 'Proposes an improvement',
    });
  });

  it('accepts the string "true" blocking flag', () => {
    const labels = getEnabledLabels(
      JSON.stringify([{ label: 'issue', display: 'issue', blocking: 'true' }]),
    );
    expect(labels[0]?.showBlockingToggle).toBe(true);
  });

  it('treats arbitrary blocking values as non-blocking', () => {
    const labels = getEnabledLabels(
      JSON.stringify([
        { label: 'question', display: 'question', blocking: false },
        { label: 'issue', display: 'issue', blocking: 'false' },
        { label: 'note', display: 'note', blocking: 1 },
        { label: 'todo', display: 'todo', blocking: null },
        { label: 'chore', display: 'chore', blocking: { enabled: true } },
      ]),
    );

    expect(labels.map((label) => label.showBlockingToggle)).toEqual([false, false, false, false, false]);
  });

  it('falls back to neutral tone for labels outside the built-in list', () => {
    const labels = getEnabledLabels(
      JSON.stringify([{ label: 'typo', display: 'typo', blocking: false }]),
    );
    expect(labels[0]?.tone).toBe('neutral');
    expect(labels[0]?.hint).toBe('typo');
  });

  it('retains empty strings and unknown labels in valid entries', () => {
    const labels = getEnabledLabels(JSON.stringify([
      { label: '', display: '', blocking: false },
      { label: 'custom', display: 'Custom', blocking: 'true' },
    ]));

    expect(labels.map(({ label, display, showBlockingToggle }) => ({ label, display, showBlockingToggle }))).toEqual([
      { label: '', display: '', showBlockingToggle: false },
      { label: 'custom', display: 'Custom', showBlockingToggle: true },
    ]);
  });

  it('skips malformed entries but keeps well-formed siblings', () => {
    const labels = getEnabledLabels(
      JSON.stringify([
        { label: 'question', display: 'question' },
        { display: 'missing-label' },
        { label: 'missing-display' },
        { label: 42, display: 'wrong-label-type' },
        { label: 'wrong-display-type', display: 42 },
        'not-an-object',
        { label: 'note', display: 'note' },
      ]),
    );
    expect(labels.map((l) => l.label)).toEqual(['question', 'note']);
  });
});
