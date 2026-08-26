import { useState, useCallback, type RefObject } from "react";
import { Option, Result, Schema } from "effect";
import type { PRDiffScope } from "@plannotator/shared/pr-stack";
import type { PRMetadata } from "@plannotator/shared/pr-types";
import {
  decodeInitialDiffResponse,
  type InitialDiffResponse,
} from "../utils/initial-diff-response";

/** Decoded `/api/pr-switch` data with required GitHub or GitLab metadata. */
export interface PRSwitchResponse extends InitialDiffResponse {
  prMetadata: PRMetadata;
}

export interface PRDiffScopeResponse extends InitialDiffResponse {
  prDiffScope: PRDiffScope;
}

const PRDiffScopeErrorSchema = Schema.Struct({
  error: Schema.optionalKey(Schema.Unknown),
});
const decodePRDiffScopeErrorEnvelope = Schema.decodeUnknownOption(PRDiffScopeErrorSchema);
const PRSwitchErrorSchema = Schema.Struct({
  error: Schema.optionalKey(Schema.Unknown),
});
const decodePRSwitchErrorEnvelope = Schema.decodeUnknownOption(PRSwitchErrorSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);

type PRResponseInput = Schema.Schema.Type<typeof Schema.Unknown>;
type PRErrorResponseInput = Schema.Schema.Type<typeof Schema.Unknown>;

/** Decode a successful `/api/pr-switch` response with required PR metadata. */
export function decodePRSwitchResponse(value: PRResponseInput): PRSwitchResponse | undefined {
  const decoded = decodeInitialDiffResponse(value);
  if (Result.isFailure(decoded)) return undefined;

  const { prMetadata } = decoded.success;
  if (prMetadata === undefined) return undefined;

  return { ...decoded.success, prMetadata };
}

/** Read only a string `error` from a non-OK `/api/pr-switch` response. */
export function decodePRSwitchError(value: PRErrorResponseInput): string | undefined {
  const envelope = Option.getOrUndefined(decodePRSwitchErrorEnvelope(value));
  if (envelope === undefined) return undefined;
  return Option.getOrUndefined(decodeString(envelope.error));
}

/** Read and validate one successful `/api/pr-switch` response. */
export async function readPRSwitchResponse(
  res: Response,
  fallbackMessage: string,
): Promise<PRSwitchResponse> {
  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    throw new Error(decodePRSwitchError(data) ?? fallbackMessage);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("Invalid PR switch response");
  }
  const decoded = decodePRSwitchResponse(data);
  if (decoded === undefined) throw new Error("Invalid PR switch response");
  return decoded;
}

/** Decode a successful `/api/pr-diff-scope` response with its required scope. */
export function decodePRDiffScopeResponse(value: PRResponseInput): PRDiffScopeResponse | undefined {
  const decoded = decodeInitialDiffResponse(value);
  if (Result.isFailure(decoded)) return undefined;

  const { prDiffScope } = decoded.success;
  if (prDiffScope !== "layer" && prDiffScope !== "full-stack") return undefined;

  return { ...decoded.success, prDiffScope };
}

/** Read only a string `error` from a non-OK `/api/pr-diff-scope` response. */
export function decodePRDiffScopeError(value: PRErrorResponseInput): string | undefined {
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
  if (decoded === undefined) throw new Error("Invalid PR diff scope response");
  return decoded;
}

export interface PRStackCallbacks {
  applyPRResponse: (data: PRSwitchResponse | PRDiffScopeResponse) => void;
  onError: (message: string) => void;
}

export function usePRStack(callbacksRef: RefObject<PRStackCallbacks | null>) {
  const [isSwitchingPRScope, setIsSwitchingPRScope] = useState(false);
  const [isLoadingFullDiff, setIsLoadingFullDiff] = useState(false);

  const handleScopeSelect = useCallback(
    async (scope: PRDiffScope) => {
      const cb = callbacksRef.current;
      if (!cb) return;
      setIsSwitchingPRScope(true);
      try {
        const res = await fetch("/api/pr-diff-scope", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
        });
        const data = await readPRDiffScopeResponse(res, "Failed to switch PR diff scope");
        cb.applyPRResponse(data);
      } catch (err) {
        cb.onError(err instanceof Error ? err.message : "Failed to switch PR diff scope");
      } finally {
        setIsSwitchingPRScope(false);
      }
    },
    [callbacksRef],
  );

  // Partial-diff upgrade: same layer re-POST as handleScopeSelect, but with
  // its own loading flag so the full-screen PRSwitchOverlay does NOT render.
  // The request can park for minutes behind the checkout warmup — the user
  // keeps reviewing the partial diff while the notice shows progress.
  const handleLoadFullDiff = useCallback(async () => {
    const cb = callbacksRef.current;
    if (!cb) return;
    setIsLoadingFullDiff(true);
    try {
      const res = await fetch("/api/pr-diff-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "layer" }),
      });
      const data = await readPRDiffScopeResponse(res, "Failed to load the full diff");
      cb.applyPRResponse(data);
    } catch (err) {
      cb.onError(err instanceof Error ? err.message : "Failed to load the full diff");
    } finally {
      setIsLoadingFullDiff(false);
    }
  }, [callbacksRef]);

  const handlePRSwitch = useCallback(
    async (prUrl: string) => {
      const cb = callbacksRef.current;
      if (!cb) return;
      setIsSwitchingPRScope(true);
      try {
        const res = await fetch("/api/pr-switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: prUrl }),
        });
        const data = await readPRSwitchResponse(res, "Failed to switch PR");
        cb.applyPRResponse(data);
      } catch (err) {
        cb.onError(err instanceof Error ? err.message : "Failed to switch PR");
      } finally {
        setIsSwitchingPRScope(false);
      }
    },
    [callbacksRef],
  );

  return {
    isSwitchingPRScope,
    isLoadingFullDiff,
    handleScopeSelect,
    handleLoadFullDiff,
    handlePRSwitch,
  };
}
