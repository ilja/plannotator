import { useState, useCallback } from "react";
import { parseCodePath } from "@plannotator/shared/code-file";

interface CodeFileState {
  filepath: string;
  contents: string;
  prerenderedHTML?: string;
  error?: string;
  requestedPath?: string;
  line?: number;
  lineEnd?: number;
}

interface UseCodeFilePopoutOptions {
  buildUrl: (codePath: string) => string;
}

export interface UseCodeFilePopoutReturn {
  open: (codePath: string) => void;
  close: () => void;
  isLoading: boolean;
  popoutProps: {
    open: boolean;
    onClose: () => void;
    filepath: string;
    contents: string;
    prerenderedHTML?: string;
    error?: string;
    requestedPath?: string;
    line?: number;
    lineEnd?: number;
  } | null;
}

export function useCodeFilePopout(
  options: UseCodeFilePopoutOptions
): UseCodeFilePopoutReturn {
  const { buildUrl } = options;
  const [state, setState] = useState<CodeFileState | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const close = useCallback(() => {
    setState(null);
    setIsLoading(false);
  }, []);

  const open = useCallback(
    async (codePath: string) => {
      setIsLoading(true);
      const parsed = parseCodePath(codePath);
      try {
        const res = await fetch(buildUrl(codePath));
        const data: {
          codeFile?: boolean;
          contents?: string;
          filepath?: string;
          prerenderedHTML?: string;
          error?: string;
          line?: number;
          lineEnd?: number;
        } = await res.json();
        if (!res.ok || data.error || !data.codeFile || Object.prototype.toString.call(data.contents) !== "[object String]" || !data.filepath) {
          setState({
            filepath: codePath,
            contents: "",
            error: data.error ?? `File not found in repo: ${codePath}`,
            requestedPath: codePath,
          });
          setIsLoading(false);
          return;
        }
        setState({
          filepath: data.filepath,
          contents: data.contents,
          prerenderedHTML: data.prerenderedHTML,
          line: data.line ?? parsed.line,
          lineEnd: data.lineEnd ?? parsed.lineEnd,
        });
        setIsLoading(false);
      } catch {
        setState({
          filepath: codePath,
          contents: "",
          error: `Failed to load: ${codePath}`,
          requestedPath: codePath,
        });
        setIsLoading(false);
      }
    },
    [buildUrl]
  );

  return {
    open,
    close,
    isLoading,
    popoutProps: state
      ? {
          open: true,
          onClose: close,
          filepath: state.filepath,
          contents: state.contents,
          prerenderedHTML: state.prerenderedHTML,
          error: state.error,
          requestedPath: state.requestedPath,
          line: state.line,
          lineEnd: state.lineEnd,
        }
      : null,
  };
}
