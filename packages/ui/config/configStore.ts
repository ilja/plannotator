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

import { SETTINGS, type SettingName, type SettingsMap } from './settings';

type Listener = () => void;

// SAFETY: deepMerge operates on untyped JSON records — any is intentional for recursive merge
function deepMerge(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    if (
      target[key] instanceof Object && target[key] !== null && !Array.isArray(target[key]) &&
      source[key] instanceof Object && source[key] !== null && !Array.isArray(source[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

/** Infer the value type from a SettingDef */
type SettingValue<K extends SettingName> = SettingsMap[K] extends { defaultValue: infer D }
  ? D extends (...args: unknown[]) => infer R ? R : D
  : never;

class ConfigStore {
  private values = new Map<string, unknown>();
  private listeners = new Set<Listener>();
  private version = 0;
  // SAFETY: pendingServerWrites is untyped server payload — any is intentional
  private pendingServerWrites: any = {};
  private serverSyncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Eagerly resolve all settings from synchronous sources (cookie > default).
    // The store is safe to read from the moment it's created.
    for (const [name, def] of Object.entries(SETTINGS)) {
      const fromCookie = def.fromCookie();
      // SAFETY: def.defaultValue is factory per SettingDef — invoke to get default value, any is intentional for generic loop
      const defaultVal = def.defaultValue instanceof Function
        ? (def.defaultValue as () => any)()
        : def.defaultValue;
      const resolved = fromCookie ?? defaultVal;
      this.values.set(name, resolved);
      // Persist generated defaults to cookie so the value is stable across calls
      if (fromCookie === undefined) {
        // SAFETY: def.toCookie expects T per SettingDef — resolved is T
        def.toCookie(resolved as never);
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
  // SAFETY: serverConfig is untyped server payload — any is intentional
  init(serverConfig?: any): void {
    if (serverConfig) {
      for (const [name, def] of Object.entries(SETTINGS)) {
        if (def.serverKey && def.fromServer) {
          const fromServer = def.fromServer(serverConfig);
          if (fromServer !== undefined) {
            this.values.set(name, fromServer);
            // SAFETY: def.toCookie expects T per SettingDef — fromServer is T
            def.toCookie(fromServer as never);
          }
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
    const def = SETTINGS[key];
    this.values.set(key, value);
    // SAFETY: def.toCookie expects T per SettingDef — value is T
    def.toCookie(value as never);

    if (def.serverKey && def.toServer) {
      // SAFETY: def.toServer returns Record<string, unknown> per SettingDef — any is intentional for merge
      deepMerge(this.pendingServerWrites, def.toServer(value as never) as any);
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
