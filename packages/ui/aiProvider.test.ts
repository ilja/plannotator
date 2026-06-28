import { describe, expect, it } from 'bun:test';
import {
  applyAIProviderSelection,
  findOriginAIProvider,
  isPiProvider,
  resolveAIProviderSelection,
  type AIProviderOption,
  type AIProviderSettings,
} from './utils/aiProvider';

const providers: AIProviderOption[] = [
  {
    id: 'pi-local',
    name: 'pi-sdk',
    models: [
      { id: 'pi-default', label: 'Pi Default', default: true },
      { id: 'pi-alt', label: 'Pi Alt' },
    ],
  },
  {
    id: 'fallback-local',
    name: 'fallback-provider',
    models: [
      { id: 'fallback-default', label: 'Fallback Default', default: true },
    ],
  },
];

const settings = (overrides: Partial<AIProviderSettings> = {}): AIProviderSettings => ({
  providerId: null,
  preferredModels: {},
  providerByOrigin: {},
  ...overrides,
});

describe('AI provider origin defaults', () => {
  it('recognizes only Pi SDK providers as retained Ask AI providers', () => {
    expect(isPiProvider(providers[0])).toBe(true);
    expect(isPiProvider(providers[1])).toBe(false);
    expect(findOriginAIProvider(providers, 'pi')?.id).toBe('pi-local');
    expect(findOriginAIProvider(providers, 'claude-code')).toBeNull();
    expect(findOriginAIProvider(providers, 'codex')).toBeNull();
    expect(findOriginAIProvider(providers, 'opencode')).toBeNull();
  });

  it('uses the Pi provider before the global saved provider for Pi sessions', () => {
    const selection = resolveAIProviderSelection({
      providers,
      origin: 'pi',
      settings: settings({ providerId: 'fallback-local' }),
    });

    expect(selection.providerId).toBe('pi-local');
    expect(selection.model).toBe('pi-default');
  });

  it('ignores stale per-origin non-Pi provider choices', () => {
    const selection = resolveAIProviderSelection({
      providers,
      origin: 'pi',
      settings: settings({
        providerByOrigin: { pi: 'fallback-local' },
        preferredModels: { 'fallback-local': 'fallback-default' },
      }),
    });

    expect(selection.providerId).toBe('pi-local');
    expect(selection.model).toBe('pi-default');
  });

  it('ignores stale non-Pi server defaults', () => {
    const selection = resolveAIProviderSelection({
      providers,
      origin: 'gemini-cli',
      settings: settings(),
      serverDefaultProvider: 'fallback-local',
    });

    expect(selection.providerId).toBe('pi-local');
    expect(selection.model).toBe('pi-default');
  });

  it('returns no selection when only non-Pi providers are available', () => {
    const selection = resolveAIProviderSelection({
      providers: [providers[1]],
      origin: 'pi',
      settings: settings({ providerId: 'fallback-local' }),
      serverDefaultProvider: 'fallback-local',
    });

    expect(selection).toEqual({ providerId: null, model: null });
  });

  it('stores explicit Pi choices without changing the global fallback', () => {
    const next = applyAIProviderSelection(
      settings({ providerId: 'fallback-local' }),
      { providerId: 'pi-local', model: 'pi-alt', origin: 'pi' },
    );

    expect(next.providerId).toBe('fallback-local');
    expect(next.providerByOrigin.pi).toBe('pi-local');
    expect(next.preferredModels['pi-local']).toBe('pi-alt');
  });

  it('does not store non-Pi provider choices', () => {
    const next = applyAIProviderSelection(
      settings({ providerId: 'pi-local' }),
      { providerId: 'fallback-local', model: 'fallback-default', origin: 'codex' },
    );

    expect(next.providerId).toBe('pi-local');
    expect(next.providerByOrigin.codex).toBeUndefined();
    expect(next.preferredModels['fallback-local']).toBeUndefined();
  });
});
