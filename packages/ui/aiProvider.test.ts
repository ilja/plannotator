import { describe, expect, it } from 'bun:test';
import {
  applyAIProviderSelection,
  findOriginAIProvider,
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
  it('matches only the Pi origin to a dedicated provider', () => {
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

  it('uses per-origin saved Pi provider choices before the automatic Pi match', () => {
    const selection = resolveAIProviderSelection({
      providers,
      origin: 'pi',
      settings: settings({
        providerByOrigin: { pi: 'fallback-local' },
        preferredModels: { 'fallback-local': 'fallback-default' },
      }),
    });

    expect(selection.providerId).toBe('fallback-local');
    expect(selection.model).toBe('fallback-default');
  });

  it('falls back to server default when an origin has no dedicated provider', () => {
    const selection = resolveAIProviderSelection({
      providers,
      origin: 'gemini-cli',
      settings: settings(),
      serverDefaultProvider: 'fallback-local',
    });

    expect(selection.providerId).toBe('fallback-local');
  });

  it('stores explicit choices for Pi without changing the global fallback', () => {
    const next = applyAIProviderSelection(
      settings({ providerId: 'fallback-local' }),
      { providerId: 'pi-local', model: 'pi-alt', origin: 'pi' },
    );

    expect(next.providerId).toBe('fallback-local');
    expect(next.providerByOrigin.pi).toBe('pi-local');
    expect(next.preferredModels['pi-local']).toBe('pi-alt');
  });

  it('stores explicit choices as the global fallback for non-Pi origins', () => {
    const next = applyAIProviderSelection(
      settings({ providerId: 'fallback-local' }),
      { providerId: 'pi-local', model: 'pi-alt', origin: 'codex' },
    );

    expect(next.providerId).toBe('pi-local');
    expect(next.providerByOrigin.codex).toBeUndefined();
  });
});
