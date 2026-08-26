/**
 * AI Provider Settings Utility
 *
 * Manages the user's default AI provider and per-provider model preferences.
 * Uses cookies (not localStorage) because each hook invocation runs on a
 * random port, and localStorage is scoped by origin including port.
 */

import { Option, Schema } from 'effect';
import { storage } from './storage';
import { AGENT_ORIGINS, getAgentAIProviderTypes, type Origin } from '@plannotator/shared/agents';

const PROVIDER_KEY = 'plannotator-ai-provider';
const MODELS_KEY = 'plannotator-ai-models';
const PROVIDER_BY_ORIGIN_KEY = 'plannotator-ai-provider-by-origin';

const StoredRecordSchema = Schema.Record(Schema.String, Schema.Json);
const OriginSchema = Schema.Literals(AGENT_ORIGINS);
const decodeStoredRecordSchema = Schema.decodeUnknownOption(StoredRecordSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeOrigin = Schema.decodeUnknownOption(OriginSchema);

export interface AIProviderModel {
  id: string;
  label: string;
  default?: boolean;
}

export interface AIProviderOption {
  id: string;
  name: string;
  models?: AIProviderModel[];
}

export interface AIProviderSettings {
  /** The provider instance ID to use, or null for server default. */
  providerId: string | null;
  /** Preferred model per provider. Key = provider instance ID, value = model ID. */
  preferredModels: Record<string, string>;
  /** Preferred provider per detected agent origin. Key = Origin, value = provider instance ID. */
  providerByOrigin: Partial<Record<Origin, string>>;
}

export interface AIProviderSelection {
  providerId: string | null;
  model: string | null;
}

export const AI_REASONING_EFFORTS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Max' },
] as const;

export function isPiProvider(provider: AIProviderOption | null | undefined): boolean {
  return provider?.id === 'pi-sdk' || provider?.name === 'pi-sdk';
}

function isPiProviderId(providerId: string | null | undefined): boolean {
  return providerId === 'pi-sdk' || providerId?.startsWith('pi-') === true;
}

export function originHasDedicatedAIProvider(origin: Origin | null | undefined): boolean {
  return getAgentAIProviderTypes(origin).includes('pi-sdk');
}

function decodeStoredRecord(raw: string) {
  try {
    return Option.getOrNull(decodeStoredRecordSchema(JSON.parse(raw)));
  } catch {
    return null;
  }
}

export function decodePreferredModels(raw: string) {
  const record = decodeStoredRecord(raw);
  if (!record) return {};
  const preferredModels: Record<string, string> = {};
  for (const [providerId, value] of Object.entries(record)) {
    const modelId = Option.getOrNull(decodeString(value));
    if (modelId !== null) preferredModels[providerId] = modelId;
  }
  return preferredModels;
}

export function decodeProviderByOrigin(raw: string) {
  const record = decodeStoredRecord(raw);
  if (!record) return {};
  const providerByOrigin: Partial<Record<Origin, string>> = {};
  for (const [key, value] of Object.entries(record)) {
    const origin = Option.getOrNull(decodeOrigin(key));
    const providerId = Option.getOrNull(decodeString(value));
    if (origin !== null && providerId !== null) providerByOrigin[origin] = providerId;
  }
  return providerByOrigin;
}

/**
 * Get current AI provider settings from storage
 */
export function getAIProviderSettings(): AIProviderSettings {
  const providerId = storage.getItem(PROVIDER_KEY) || null;
  const preferredModels = storage.getItem(MODELS_KEY);
  const providerByOrigin = storage.getItem(PROVIDER_BY_ORIGIN_KEY);
  return {
    providerId,
    preferredModels: preferredModels ? decodePreferredModels(preferredModels) : {},
    providerByOrigin: providerByOrigin ? decodeProviderByOrigin(providerByOrigin) : {},
  };
}

/**
 * Save AI provider settings to storage
 */
export function saveAIProviderSettings(settings: AIProviderSettings): void {
  if (settings.providerId) {
    storage.setItem(PROVIDER_KEY, settings.providerId);
  } else {
    storage.removeItem(PROVIDER_KEY);
  }
  storage.setItem(MODELS_KEY, JSON.stringify(settings.preferredModels));
  const providerByOrigin = settings.providerByOrigin ?? {};
  if (Object.keys(providerByOrigin).length > 0) {
    storage.setItem(PROVIDER_BY_ORIGIN_KEY, JSON.stringify(providerByOrigin));
  } else {
    storage.removeItem(PROVIDER_BY_ORIGIN_KEY);
  }
}

/**
 * Get the preferred model for a specific provider
 */
export function getPreferredModel(providerId: string): string | null {
  const { preferredModels } = getAIProviderSettings();
  return preferredModels[providerId] ?? null;
}

/**
 * Save the preferred model for a specific provider (without changing other preferences)
 */
export function savePreferredModel(providerId: string, modelId: string): void {
  const settings = getAIProviderSettings();
  settings.preferredModels[providerId] = modelId;
  saveAIProviderSettings(settings);
}

/**
 * Find the first available provider that naturally matches the current origin.
 * Instance IDs can be custom, so we match both the registry ID and provider type.
 */
export function findOriginAIProvider(
  providers: AIProviderOption[],
  origin: Origin | null | undefined,
): AIProviderOption | null {
  const providerTypes = getAgentAIProviderTypes(origin).filter(providerType => providerType === 'pi-sdk');
  for (const providerType of providerTypes) {
    const provider = providers.find(p => isPiProvider(p) && (p.id === providerType || p.name === providerType));
    if (provider) return provider;
  }
  return null;
}

export function resolveAIModelForProvider(
  provider: AIProviderOption | null | undefined,
  preferredModels: Record<string, string>,
): string | null {
  if (!provider) return null;
  const models = provider.models ?? [];
  const modelIds = new Set(models.map(m => m.id));
  const preferredModel = preferredModels[provider.id];
  if (preferredModel && (modelIds.size === 0 || modelIds.has(preferredModel))) {
    return preferredModel;
  }
  const defaultModel = models.find(m => m.default) ?? models[0];
  return defaultModel?.id ?? null;
}

export function resolveAIProviderSelection(options: {
  providers: AIProviderOption[];
  origin?: Origin | null;
  settings?: AIProviderSettings;
  serverDefaultProvider?: string | null;
}): AIProviderSelection {
  const { origin, serverDefaultProvider } = options;
  const settings = options.settings ?? getAIProviderSettings();
  const providers = options.providers.filter(isPiProvider);
  if (providers.length === 0) return { providerId: null, model: null };

  const byId = (id: string | null | undefined) =>
    id ? providers.find(provider => provider.id === id) ?? null : null;

  const provider =
    byId(origin ? settings.providerByOrigin[origin] : null) ??
    findOriginAIProvider(providers, origin) ??
    byId(settings.providerId) ??
    byId(serverDefaultProvider) ??
    providers[0] ??
    null;

  return {
    providerId: provider?.id ?? null,
    model: resolveAIModelForProvider(provider, settings.preferredModels),
  };
}

export function saveAIProviderSelection(options: {
  providerId: string | null;
  model?: string | null;
  origin?: Origin | null;
  settings?: AIProviderSettings;
}): void {
  const settings = options.settings ?? getAIProviderSettings();
  saveAIProviderSettings(applyAIProviderSelection(settings, options));
}

export function applyAIProviderSelection(
  settings: AIProviderSettings,
  options: {
    providerId: string | null;
    model?: string | null;
    origin?: Origin | null;
  },
): AIProviderSettings {
  const preferredModels = { ...settings.preferredModels };
  const retainedProviderId = isPiProviderId(options.providerId) ? options.providerId : null;
  if (retainedProviderId && options.model) {
    preferredModels[retainedProviderId] = options.model;
  }

  const providerByOrigin = { ...settings.providerByOrigin };
  let providerId = settings.providerId;
  const hasOriginDefault = originHasDedicatedAIProvider(options.origin);

  if (options.origin && hasOriginDefault) {
    if (retainedProviderId) {
      providerByOrigin[options.origin] = retainedProviderId;
    } else {
      delete providerByOrigin[options.origin];
    }
  } else if (retainedProviderId || options.providerId === null) {
    providerId = retainedProviderId;
  }

  return {
    ...settings,
    providerId,
    preferredModels,
    providerByOrigin,
  };
}
