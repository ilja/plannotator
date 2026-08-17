import { describe, expect, it } from 'bun:test';
import { getEnabledLabels } from './ConventionalLabelPicker';

describe('getEnabledLabels', () => {
  it('returns all defaults for null or empty config', () => {
    expect(getEnabledLabels(null)).toHaveLength(9);
    expect(getEnabledLabels('')).toHaveLength(9);
  });

  it('returns all defaults for invalid JSON', () => {
    expect(getEnabledLabels('not json')).toHaveLength(9);
  });

  it('returns all defaults for a non-array value', () => {
    expect(getEnabledLabels('{"label":"suggestion"}')).toHaveLength(9);
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

  it('falls back to neutral tone for labels outside the built-in list', () => {
    const labels = getEnabledLabels(
      JSON.stringify([{ label: 'typo', display: 'typo', blocking: false }]),
    );
    expect(labels[0]?.tone).toBe('neutral');
    expect(labels[0]?.hint).toBe('typo');
  });

  it('skips malformed entries but keeps well-formed siblings', () => {
    const labels = getEnabledLabels(
      JSON.stringify([
        { label: 'question', display: 'question' },
        { display: 'missing-label' },
        'not-an-object',
        { label: 'note', display: 'note' },
      ]),
    );
    expect(labels.map((l) => l.label)).toEqual(['question', 'note']);
  });
});