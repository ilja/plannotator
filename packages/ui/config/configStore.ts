/**
 * ConfigStore — Unified config resolver for Plannotator
 *
 * Singleton that resolves settings with precedence:
 *   server config file > cookie > default
 *
 * Works both inside and outside React. React components subscribe
 * via useSyncExternalStore (see useConfig.ts).
 *
 * Server-synced settings automatically write back to ~/.plannotator/config.json
 * via a debounced POST /api/config.
 */

import type { ConfigPatch } from '@plannotator/shared/config';
import {
  decodeUiServerConfig,
  SETTINGS,
  type SettingDef,
  type SettingName,
  type SettingsMap,
} from './settings';

type Listener = () => void;

function mergeConfigPatches(current: ConfigPatch, patch: ConfigPatch): ConfigPatch {
  const diffOptions = current.diffOptions || patch.diffOptions
    ? { ...current.diffOptions, ...patch.diffOptions }
    : undefined;
  const annotationOptions = current.annotationOptions || patch.annotationOptions
    ? { ...current.annotationOptions, ...patch.annotationOptions }
    : undefined;

  return {
    ...current,
    ...patch,
    ...(diffOptions && { diffOptions }),
    ...(annotationOptions && { annotationOptions }),
  };
}

/** Infer the value type from a SettingDef */
type SettingValue<K extends SettingName> = SettingsMap[K] extends { defaultValue: infer D }
  ? D extends (...args: unknown[]) => infer R ? R : D
  : never;

function resolveDefaultValue<Value>(definition: SettingDef<Value>): Value {
  return definition.defaultValue instanceof Function
    ? definition.defaultValue()
    : definition.defaultValue;
}

export class ConfigStore {
  private values = new Map<string, unknown>();
  private listeners = new Set<Listener>();
  private version = 0;
  private pendingServerWrites: ConfigPatch = {};
  private serverSyncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Eagerly resolve all settings from synchronous sources (cookie > default).
    // The store is safe to read from the moment it's created.
    for (const [name, def] of Object.entries(SETTINGS)) {
      const definition: SettingDef<unknown> = def;
      const fromCookie = definition.fromCookie();
      const defaultVal = resolveDefaultValue(definition);
      const resolved = fromCookie ?? defaultVal;
      this.values.set(name, resolved);
      // Persist generated defaults to cookie so the value is stable across calls
      if (fromCookie === undefined) {
        definition.toCookie(resolved);
      }
    }
  }

  /**
   * Apply server config overrides.
   * Call once after fetching /api/plan or /api/diff.
   *
   * Server values take precedence over the cookie/default already resolved
   * by the constructor. Settings without a server value are left untouched.
   */
  init<Input>(serverConfig?: Input): void {
    const decodedServerConfig = decodeUiServerConfig(serverConfig);
    for (const [name, def] of Object.entries(SETTINGS)) {
      const definition: SettingDef<unknown> = def;
      if (definition.serverKey && definition.fromServer) {
        const fromServer = definition.fromServer(decodedServerConfig);
        if (fromServer !== undefined) {
          this.values.set(name, fromServer);
          definition.toCookie(fromServer);
        }
      }
    }
    this.notify();
  }

  /** Get a resolved config value. Works outside React. */
  get<K extends SettingName>(key: K): SettingValue<K> {
    // SAFETY: values map stores SettingValue<K> per SETTINGS — cast is typed retrieval
    return this.values.get(key) as SettingValue<K>;
  }

  /** Set a config value. Writes cookie (sync), queues server write-back if applicable. */
  set<K extends SettingName>(key: K, value: SettingValue<K>): void {
    const def: SettingDef<unknown> = SETTINGS[key];
    this.values.set(key, value);
    def.toCookie(value);

    if (def.serverKey && def.toServer) {
      this.pendingServerWrites = mergeConfigPatches(
        this.pendingServerWrites,
        def.toServer(value),
      );
      this.scheduleServerSync();
    }

    this.notify();
  }

  /** Subscribe to changes. Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private scheduleServerSync(): void {
    if (this.serverSyncTimer) clearTimeout(this.serverSyncTimer);
    this.serverSyncTimer = setTimeout(() => {
      const payload = { ...this.pendingServerWrites };
      this.pendingServerWrites = {};
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {}); // best-effort
    }, 300);
  }
}

export const configStore = new ConfigStore();
export type { SettingValue };
