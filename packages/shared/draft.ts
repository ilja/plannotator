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

type DraftJsonValue = string | number | boolean | null | DraftJsonValue[] | { [key: string]: DraftJsonValue };

interface DraftFileData {
  readonly draftGeneration?: DraftJsonValue;
  readonly [key: string]: DraftJsonValue | undefined;
}

const DraftGenerationSchema = Schema.Natural;

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

function readGeneration(value: DraftJsonValue | undefined): number | null {
  return Option.getOrUndefined(Schema.decodeUnknownOption(DraftGenerationSchema)(value)) ?? null;
}

function readTombstoneGeneration(key: string): number | null {
  const filePath = tombstonePath(key);
  try {
    if (!existsSync(filePath)) return null;
    const parsed: DraftFileData = JSON.parse(readFileSync(filePath, "utf-8"));
    return readGeneration(parsed.draftGeneration);
  } catch {
    return null;
  }
}

function readStoredDraftGeneration(key: string): number | null {
  const filePath = draftPath(key);
  try {
    if (!existsSync(filePath)) return null;
    const parsed: DraftFileData = JSON.parse(readFileSync(filePath, "utf-8"));
    return readGeneration(parsed.draftGeneration);
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

interface DraftCarrier {
  readonly draftGeneration?: unknown;
}

/**
 * Save a draft to disk.
 */
export function saveDraft<T>(key: string, data: T): boolean {
  // SAFETY: draft payloads are JSON objects with optional draftGeneration; extra fields are the caller's draft content.
  const draftGeneration = Option.getOrUndefined(
    Schema.decodeUnknownOption(DraftGenerationSchema)((data as DraftCarrier).draftGeneration),
  ) ?? null;
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
  writeFileSync(tmpPath, JSON.stringify(data), "utf-8");
  renameSync(tmpPath, finalPath);
  if (draftGeneration === null) {
    clearTombstone(key);
  }
  return true;
}

/**
 * Load a draft from disk. Returns null if not found.
 */
export function loadDraft<T = DraftFileData>(key: string): T | null {
  const filePath = draftPath(key);
  try {
    if (!existsSync(filePath)) return null;
    const draft: T = JSON.parse(readFileSync(filePath, "utf-8"));
    // SAFETY: draft file is a JSON object with optional draftGeneration; other fields are the persisted draft.
    const draftGeneration = Option.getOrUndefined(
      Schema.decodeUnknownOption(DraftGenerationSchema)((draft as DraftCarrier).draftGeneration),
    ) ?? null;
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
    const generation = readGeneration(draftGeneration);
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
