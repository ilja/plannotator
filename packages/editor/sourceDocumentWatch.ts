/** The EventSource transport surface required by the source document watcher. */
export interface SourceDocumentWatchEventSource {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: (() => void) | null;
  close: () => void;
}

/** Transport and lifecycle-command dependencies for a source document watcher. */
export interface SourceDocumentWatchOptions {
  directories: readonly string[];
  onReconcile: (changedDir?: string) => void | Promise<void>;
  debounceMs?: number;
  reconnectDelayMs?: number;
  eventSourceFactory?: (url: string) => SourceDocumentWatchEventSource;
}

function watchedDirectory(directory: string | undefined, directories: readonly string[]): boolean {
  return directory === undefined || directories.includes(directory);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseWatchEvent(data: string): { type: 'ready' | 'changed'; dirPath?: string } | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!isRecord(value)) return null;
    const record = value;
    if (record.type !== 'ready' && record.type !== 'changed') return null;
    if (record.dirPath !== undefined && typeof record.dirPath !== 'string') return null;
    return {
      type: record.type,
      ...(typeof record.dirPath === 'string' ? { dirPath: record.dirPath } : {}),
    };
  } catch {
    return null;
  }
}

/** Start the EventSource transport that requests source-backed reconciliation commands. */
export function createSourceDocumentWatch(options: SourceDocumentWatchOptions): () => void {
  const directories = [...new Set(options.directories)].filter(Boolean);
  if (directories.length === 0) return () => undefined;

  const debounceMs = options.debounceMs ?? 120;
  const reconnectDelayMs = options.reconnectDelayMs ?? 1000;
  const eventSourceFactory = options.eventSourceFactory
    ?? (typeof EventSource === 'undefined' ? undefined : (url: string) => new EventSource(url));
  if (!eventSourceFactory) return () => undefined;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let source: SourceDocumentWatchEventSource | undefined;
  let stopped = false;

  const scheduleReconcile = (changedDir?: string) => {
    const key = changedDir ?? '*';
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      void options.onReconcile(changedDir);
    }, debounceMs));
  };

  const connect = () => {
    if (stopped) return;
    const params = new URLSearchParams();
    for (const directory of directories) params.append('dirPath', directory);
    const nextSource = eventSourceFactory(`/api/reference/files/stream?${params.toString()}`);
    source = nextSource;
    nextSource.onmessage = (event) => {
      if (source !== nextSource || stopped) return;
      const payload = parseWatchEvent(event.data);
      if (!payload || !watchedDirectory(payload.dirPath, directories)) return;
      scheduleReconcile(payload.dirPath);
    };
    nextSource.onerror = () => {
      if (source !== nextSource || stopped) return;
      source = undefined;
      nextSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, reconnectDelayMs);
    };
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    source?.close();
    source = undefined;
  };
}
