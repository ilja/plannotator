import { useState, useCallback, type RefObject } from 'react';
import { Option, Result, Schema } from 'effect';
import type { PRDiffScope } from '@plannotator/shared/pr-stack';
import type { SemanticDiffAdvert } from '@plannotator/shared/semantic-diff-types';
import {
  decodeInitialDiffResponse,
  type InitialDiffResponse,
} from '../utils/initial-diff-response';

export interface PRSwitchResponse {
  rawPatch: string;
  gitRef: string;
  prMetadata?: unknown;
  prStackInfo?: unknown;
  prStackTree?: unknown;
  prDiffScope?: PRDiffScope;
  prDiffScopeOptions?: unknown[];
  prPatchIncomplete?: boolean;
  prPatchUpgradeAvailable?: boolean;
  repoInfo?: unknown;
  viewedFiles?: string[];
  error?: string;
  semanticDiff?: SemanticDiffAdvert;
}

export interface PRDiffScopeResponse extends InitialDiffResponse {
  prDiffScope: PRDiffScope;
}

const PRDiffScopeErrorSchema = Schema.Struct({
  error: Schema.optionalKey(Schema.Unknown),
});
const decodePRDiffScopeErrorEnvelope = Schema.decodeUnknownOption(PRDiffScopeErrorSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);

type PRDiffScopeResponseInput = Schema.Schema.Type<typeof Schema.Unknown>;
type PRDiffScopeErrorInput = Schema.Schema.Type<typeof Schema.Unknown>;

/** Decode a successful `/api/pr-diff-scope` response with its required scope. */
export function decodePRDiffScopeResponse(value: PRDiffScopeResponseInput): PRDiffScopeResponse | undefined {
  const decoded = decodeInitialDiffResponse(value);
  if (Result.isFailure(decoded)) return undefined;

  const { prDiffScope } = decoded.success;
  if (prDiffScope !== 'layer' && prDiffScope !== 'full-stack') return undefined;

  return { ...decoded.success, prDiffScope };
}

/** Read only a string `error` from a non-OK `/api/pr-diff-scope` response. */
export function decodePRDiffScopeError(value: PRDiffScopeErrorInput): string | undefined {
  const envelope = Option.getOrUndefined(decodePRDiffScopeErrorEnvelope(value));
  if (envelope === undefined) return undefined;
  return Option.getOrUndefined(decodeString(envelope.error));
}

/** Read and validate one successful `/api/pr-diff-scope` response. */
export async function readPRDiffScopeResponse(
  res: Response,
  fallbackMessage: string,
): Promise<PRDiffScopeResponse> {
  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    throw new Error(decodePRDiffScopeError(data) ?? fallbackMessage);
  }

  const decoded = decodePRDiffScopeResponse(await res.json());
  if (decoded === undefined) throw new Error('Invalid PR diff scope response');
  return decoded;
}

export interface PRStackCallbacks {
  applyPRResponse: (data: PRSwitchResponse) => void;
  onError: (message: string) => void;
}

export function usePRStack(callbacksRef: RefObject<PRStackCallbacks | null>) {
  const [isSwitchingPRScope, setIsSwitchingPRScope] = useState(false);
  const [isLoadingFullDiff, setIsLoadingFullDiff] = useState(false);

  const handleScopeSelect = useCallback(async (scope: PRDiffScope) => {
    const cb = callbacksRef.current;
    if (!cb) return;
    setIsSwitchingPRScope(true);
    try {
      const res = await fetch('/api/pr-diff-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const data = await readPRDiffScopeResponse(res, 'Failed to switch PR diff scope');
      cb.applyPRResponse(data);
    } catch (err) {
      cb.onError(err instanceof Error ? err.message : 'Failed to switch PR diff scope');
    } finally {
      setIsSwitchingPRScope(false);
    }
  }, [callbacksRef]);

  // Partial-diff upgrade: same layer re-POST as handleScopeSelect, but with
  // its own loading flag so the full-screen PRSwitchOverlay does NOT render.
  // The request can park for minutes behind the checkout warmup — the user
  // keeps reviewing the partial diff while the notice shows progress.
  const handleLoadFullDiff = useCallback(async () => {
    const cb = callbacksRef.current;
    if (!cb) return;
    setIsLoadingFullDiff(true);
    try {
      const res = await fetch('/api/pr-diff-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'layer' }),
      });
      const data = await readPRDiffScopeResponse(res, 'Failed to load the full diff');
      cb.applyPRResponse(data);
    } catch (err) {
      cb.onError(err instanceof Error ? err.message : 'Failed to load the full diff');
    } finally {
      setIsLoadingFullDiff(false);
    }
  }, [callbacksRef]);

  const handlePRSwitch = useCallback(async (prUrl: string) => {
    const cb = callbacksRef.current;
    if (!cb) return;
    setIsSwitchingPRScope(true);
    try {
      const res = await fetch('/api/pr-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: prUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to switch PR');
      }
      cb.applyPRResponse(data);
    } catch (err) {
      cb.onError(err instanceof Error ? err.message : 'Failed to switch PR');
    } finally {
      setIsSwitchingPRScope(false);
    }
  }, [callbacksRef]);

  return {
    isSwitchingPRScope,
    isLoadingFullDiff,
    handleScopeSelect,
    handleLoadFullDiff,
    handlePRSwitch,
  };
}
