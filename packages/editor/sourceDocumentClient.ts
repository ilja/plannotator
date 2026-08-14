import {
  isSourceFileEol,
  type SourceFileEol,
  type SourceSaveCapability,
  type SourceSaveRequest,
} from '@plannotator/shared/source-save';

type EnabledSourceSaveCapability = Extract<SourceSaveCapability, { enabled: true }>;

export type SourceSaveProbeResult =
  | { status: 'ok'; sourceSave: EnabledSourceSaveCapability }
  | { status: 'missing' }
  | { status: 'unavailable' };

interface SourceDocumentResponse {
  markdown?: string;
  sourceSave?: SourceSaveCapability;
  renderAs?: 'markdown' | 'html';
}

type SourceDocumentFetchResult =
  | { status: 'ok'; data: SourceDocumentResponse }
  | { status: 'missing' }
  | { status: 'unavailable' };

export interface SourceDocumentSnapshot {
  markdown: string;
  sourceSave: EnabledSourceSaveCapability;
}

export type SourceDocumentSnapshotResult =
  | { status: 'ok'; snapshot: SourceDocumentSnapshot }
  | { status: 'missing' }
  | { status: 'unavailable' };

/** The complete disk metadata returned after a source-backed document save. */
export interface SourceDocumentSaveMetadata {
  hash: string;
  mtimeMs: number;
  size: number;
  eol: SourceFileEol;
}

/** A source-backed document Save response containing the current disk text. */
export interface SourceDocumentSaveConflictSnapshot extends SourceDocumentSaveMetadata {
  text: string;
}

/** The typed request sent to the source-backed document Save endpoint. */
export type SourceDocumentSaveRequest = SourceSaveRequest;

/** The source-backed document Save outcomes exposed to the lifecycle module. */
export type SourceDocumentSaveResult =
  | { status: 'saved'; sourceSave: SourceDocumentSaveMetadata }
  | { status: 'conflict'; message: string; snapshot: SourceDocumentSaveConflictSnapshot }
  | { status: 'conflict-incomplete'; message: string }
  | { status: 'error'; code: 'invalid-response' | 'unavailable' | 'not-writable' | 'write-failed' | 'invalid-request'; message: string };

async function fetchSourceDocument(path: string): Promise<SourceDocumentFetchResult> {
  try {
    const res = await fetch(`/api/doc?path=${encodeURIComponent(path)}`);
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'unavailable' };
    return { status: 'ok', data: await res.json() as SourceDocumentResponse };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function probeSourceSave(path: string): Promise<SourceSaveProbeResult> {
  const result = await fetchSourceDocument(path);
  if (result.status !== 'ok') return { status: result.status };

  const { sourceSave } = result.data;
  if (sourceSave?.enabled) return { status: 'ok', sourceSave };
  if (sourceSave?.enabled === false && sourceSave.reason === 'missing-file') {
    return { status: 'missing' };
  }
  return { status: 'unavailable' };
}

export async function fetchSourceDocumentSnapshot(path: string): Promise<SourceDocumentSnapshotResult> {
  const result = await fetchSourceDocument(path);
  if (result.status !== 'ok') return { status: result.status };

  const { markdown, renderAs, sourceSave } = result.data;
  if (sourceSave?.enabled === false && sourceSave.reason === 'missing-file') {
    return { status: 'missing' };
  }
  if (renderAs === 'html' || typeof markdown !== 'string' || !sourceSave?.enabled) return { status: 'unavailable' };
  return { status: 'ok', snapshot: { markdown, sourceSave } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sourceDocumentSaveMetadata(value: Record<string, unknown>): SourceDocumentSaveMetadata | null {
  if (
    typeof value.hash !== 'string' ||
    typeof value.mtimeMs !== 'number' ||
    typeof value.size !== 'number' ||
    !isSourceFileEol(value.eol)
  ) return null;
  return { hash: value.hash, mtimeMs: value.mtimeMs, size: value.size, eol: value.eol };
}

async function readSourceDocumentSaveResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Save a source-backed document through the browser source-save endpoint. */
export async function saveSourceDocument(input: SourceDocumentSaveRequest): Promise<SourceDocumentSaveResult> {
  let response: Response;
  try {
    response = await fetch('/api/source/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    return { status: 'error', code: 'unavailable', message: 'Save failed' };
  }

  const payload = await readSourceDocumentSaveResponse(response);
  if (!isRecord(payload) || typeof payload.ok !== 'boolean') {
    return { status: 'error', code: 'invalid-response', message: 'Save failed' };
  }

  if (!response.ok && payload.ok) {
    return { status: 'error', code: 'invalid-response', message: 'Save failed' };
  }

  if (payload.ok) {
    const sourceSave = sourceDocumentSaveMetadata(payload);
    return sourceSave
      ? { status: 'saved', sourceSave }
      : { status: 'error', code: 'invalid-response', message: 'Save failed' };
  }

  const message = typeof payload.message === 'string' ? payload.message : 'Save failed';
  if (payload.code === 'conflict') {
    const snapshot = sourceDocumentSaveMetadata({
      hash: payload.currentHash,
      mtimeMs: payload.currentMtimeMs,
      size: payload.currentSize,
      eol: payload.currentEol,
    });
    if (typeof payload.currentText !== 'string' || !snapshot) {
      return { status: 'conflict-incomplete', message };
    }
    return {
      status: 'conflict',
      message,
      snapshot: { text: payload.currentText, ...snapshot },
    };
  }

  if (payload.code === 'not-writable' || payload.code === 'write-failed' || payload.code === 'invalid-request') {
    return { status: 'error', code: payload.code, message };
  }
  return { status: 'error', code: 'invalid-response', message };
}
