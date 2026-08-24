/**
 * Draft Storage
 *
 * Persists annotation drafts to ~/.plannotator/drafts/ so they survive
 * server crashes. Each draft is keyed by a content hash of the plan/diff
 * it was created against.
 *
 * Runtime-agnostic: uses only node:fs, node:path, node:os, node:crypto.
 */

import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync, existsSync } from "fs";
import { createHash } from "crypto";
import { Option, Schema } from "effect";
import { getPlannotatorDataDir } from "./data-dir";
import type { SourceSaveCapability } from "./source-save";

const DraftGenerationSchema = Schema.Natural;
const DraftEnvelopeSchema = Schema.Record(Schema.String, Schema.Unknown);
type DraftEnvelope = Schema.Schema.Type<typeof DraftEnvelopeSchema>;

export type SourceBackedDraftSourceSaveCapability = Extract<SourceSaveCapability, { enabled: true }>;

export interface SourceBackedSavedFileChangeDraftData {
  key: string;
  path: string;
  basename: string;
  beforeText: string;
  afterText: string;
  beforeHash?: string;
  afterHash?: string;
  sourceSave: SourceBackedDraftSourceSaveCapability;
}

export interface SourceBackedDocumentDraftData {
  key: string;
  sourceSave: SourceBackedDraftSourceSaveCapability;
  sessionOpenText: string;
  diskBaseline: string;
  currentText: string;
  missingOnDisk?: boolean;
  savedChange?: SourceBackedSavedFileChangeDraftData;
}

/**
 * Get the drafts directory, creating it if needed.
 */
export function getDraftDir(): string {
  const dir = join(getPlannotatorDataDir(), "drafts");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Generate a stable key from content using truncated SHA-256.
 * Same content always produces the same key across server restarts.
 */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function draftPath(key: string): string {
  return join(getDraftDir(), `${key}.json`);
}

function tombstonePath(key: string): string {
  return join(getDraftDir(), `${key}.deleted.json`);
}

function readDraftGeneration(draft: DraftEnvelope): number | null {
  return Option.getOrUndefined(Schema.decodeUnknownOption(DraftGenerationSchema)(draft.draftGeneration)) ?? null;
}

function parseDraftEnvelope(serializedDraft: string): DraftEnvelope | null {
  try {
    const parsedDraft: unknown = JSON.parse(serializedDraft);
    return Option.getOrUndefined(Schema.decodeUnknownOption(DraftEnvelopeSchema)(parsedDraft)) ?? null;
  } catch {
    return null;
  }
}

function readTombstoneGeneration(key: string): number | null {
  const filePath = tombstonePath(key);
  try {
    if (!existsSync(filePath)) return null;
    const tombstone = parseDraftEnvelope(readFileSync(filePath, "utf-8"));
    return tombstone === null ? null : readDraftGeneration(tombstone);
  } catch {
    return null;
  }
}

function readStoredDraftGeneration(key: string): number | null {
  const filePath = draftPath(key);
  try {
    if (!existsSync(filePath)) return null;
    const draft = parseDraftEnvelope(readFileSync(filePath, "utf-8"));
    return draft === null ? null : readDraftGeneration(draft);
  } catch {
    return null;
  }
}

export function getDraftGeneration(key: string): number | null {
  const generations = [
    readStoredDraftGeneration(key),
    readTombstoneGeneration(key),
  ].filter((value): value is number => value !== null);
  return generations.length > 0 ? Math.max(...generations) : null;
}

function writeTombstoneGeneration(key: string, draftGeneration: number): void {
  const filePath = tombstonePath(key);
  writeFileSync(filePath, JSON.stringify({ draftGeneration }), "utf-8");
}

function clearTombstone(key: string): void {
  const filePath = tombstonePath(key);
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    // Ignore cleanup failures.
  }
}

/**
 * Save a draft to disk.
 */
export function saveDraft<T>(key: string, data: T): boolean {
  const draft = Option.getOrUndefined(Schema.decodeUnknownOption(DraftEnvelopeSchema)(data));
  if (draft === undefined) return false;

  const draftGeneration = readDraftGeneration(draft);
  const deletedGeneration = readTombstoneGeneration(key);
  if (draftGeneration !== null && deletedGeneration !== null && draftGeneration <= deletedGeneration) {
    return false;
  }
  const storedGeneration = readStoredDraftGeneration(key);
  if (draftGeneration !== null && storedGeneration !== null && draftGeneration < storedGeneration) {
    return false;
  }

  // Write-then-rename so a crash mid-write can't leave a truncated draft —
  // loadDraft would silently return null at exactly the recovery moment
  // drafts exist for. rename() is atomic within a directory.
  const finalPath = draftPath(key);
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(draft), "utf-8");
  renameSync(tmpPath, finalPath);
  if (draftGeneration === null) {
    clearTombstone(key);
  }
  return true;
}

/**
 * Load a draft from disk. Returns null if not found.
 */
export function loadDraft(key: string): DraftEnvelope | null {
  const filePath = draftPath(key);
  try {
    if (!existsSync(filePath)) return null;
    const draft = parseDraftEnvelope(readFileSync(filePath, "utf-8"));
    if (draft === null) return null;

    const draftGeneration = readDraftGeneration(draft);
    const deletedGeneration = readTombstoneGeneration(key);
    if (draftGeneration !== null && deletedGeneration !== null && draftGeneration <= deletedGeneration) {
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/**
 * Delete a draft from disk. No-op if not found.
 */
export function deleteDraft(key: string, draftGeneration?: number): void {
  const filePath = draftPath(key);
  try {
    const generation = Option.getOrUndefined(
      Schema.decodeUnknownOption(DraftGenerationSchema)(draftGeneration),
    ) ?? null;
    if (generation !== null) {
      const knownGeneration = getDraftGeneration(key);
      if (knownGeneration !== null && generation < knownGeneration) return;
    }

    if (existsSync(filePath)) unlinkSync(filePath);
    if (generation !== null) writeTombstoneGeneration(key, generation);
    else clearTombstone(key);
  } catch {
    // Ignore delete failures
  }
}
