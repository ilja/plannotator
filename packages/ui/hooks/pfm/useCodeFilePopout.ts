import { useState, useCallback } from "react";
import { decodeCodeFileErrorResponse, decodeCodeFileSuccessResponse } from "../codeFileResponse";

interface LoadedPopout {
  filepath: string;
  contents: string;
  prerenderedHTML?: string;
}

interface FailedPopout {
  filepath: string;
  contents: "";
  error: string;
  requestedPath: string;
}

type PopoutState =
  | { status: "closed" }
  | { status: "loading" }
  | { status: "loaded"; popout: LoadedPopout }
  | { status: "failed"; popout: FailedPopout };

interface UseCodeFilePopoutOptions {
  buildUrl: (codePath: string) => string;
}

export interface UseCodeFilePopoutReturn {
  open: (codePath: string) => void;
  close: () => void;
  popoutProps: {
    open: boolean;
    onClose: () => void;
    filepath: string;
    contents: string;
    prerenderedHTML?: string;
    error?: string;
    requestedPath?: string;
  } | null;
}

function toFailedPopout(codePath: string, error: string): FailedPopout {
  return { filepath: codePath, contents: "", error, requestedPath: codePath };
}

export function useCodeFilePopout(options: UseCodeFilePopoutOptions): UseCodeFilePopoutReturn {
  const { buildUrl } = options;
  // One request lifecycle: loading carries no content, so the popover never
  // shows a stale file while its replacement loads, and a failure carries
  // no contents. The previous isLoading flag had no readers.
  const [state, setState] = useState<PopoutState>({ status: "closed" });

  const close = useCallback(() => {
    setState({ status: "closed" });
  }, []);

  const open = useCallback(
    async (codePath: string) => {
      setState({ status: "loading" });

      try {
        const res = await fetch(buildUrl(codePath));
        const rawData: unknown = await res.json();
        const data = decodeCodeFileSuccessResponse(rawData);
        const error = decodeCodeFileErrorResponse(rawData);

        if (!res.ok || error || !data || data.codeFile !== true) {
          setState({
            status: "failed",
            popout: toFailedPopout(codePath, error ?? `File not found in repo: ${codePath}`),
          });

          return;
        }

        setState({
          status: "loaded",
          popout: {
            filepath: data.filepath,
            contents: data.contents,
            prerenderedHTML: data.prerenderedHTML,
          },
        });
      } catch {
        setState({
          status: "failed",
          popout: toFailedPopout(codePath, `Failed to load: ${codePath}`),
        });
      }
    },
    [buildUrl],
  );

  if (state.status === "closed" || state.status === "loading") {
    return { open, close, popoutProps: null };
  }

  return {
    open,
    close,
    popoutProps: { open: true, onClose: close, ...state.popout },
  };
}
