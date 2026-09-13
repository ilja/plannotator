import { useState, useRef, useCallback, useEffect } from "react";
import type { PRContext, PRMetadata } from "@plannotator/shared/pr-types";
import { decodePRContextError, decodePRContextResponse } from "../utils/pr-context-response";

/** Read and validate one `/api/pr-context` response before updating hook state. */
export async function readPRContextResponse(res: Response): Promise<PRContext> {
  if (!res.ok) {
    let data: unknown;

    try {
      data = await res.json();
    } catch {
      data = undefined;
    }

    throw new Error(decodePRContextError(data) ?? `HTTP ${res.status}`);
  }

  return decodePRContextResponse(await res.json());
}

export interface UsePRContextReturn {
  readonly prContext: PRContext | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly fetchContext: () => Promise<void>;
}

export function usePRContext(prMetadata: PRMetadata | null): UsePRContextReturn {
  const [state, setState] = useState<
    | { readonly status: "idle" }
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly context: PRContext }
    | { readonly status: "failed"; readonly error: string }
  >({ status: "idle" });

  const fetched = useRef(false);
  const lastUrl = useRef<string | undefined>(undefined);

  useEffect(() => {
    const url = prMetadata?.url;

    if (url !== lastUrl.current) {
      lastUrl.current = url;
      fetched.current = false;
      setState({ status: "idle" });
    }
  }, [prMetadata?.url]);

  const fetchContext = useCallback(async () => {
    if (!prMetadata || fetched.current) return;
    const requestUrl = prMetadata.url;
    fetched.current = true;
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/pr-context");

      if (requestUrl !== lastUrl.current) return;
      const context = await readPRContextResponse(res);

      if (requestUrl !== lastUrl.current) return;
      setState({ status: "ready", context });
    } catch (err) {
      if (requestUrl !== lastUrl.current) return;
      const message = err instanceof Error ? err.message : "Failed to load PR context";
      setState({ status: "failed", error: message });
      fetched.current = false;
    }
  }, [prMetadata]);

  return {
    prContext: state.status === "ready" ? state.context : null,
    isLoading: state.status === "loading",
    error: state.status === "failed" ? state.error : null,
    fetchContext,
  };
}
