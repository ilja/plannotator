import { useEffect, useState } from "react";
import { extractCandidateCodePaths } from "@plannotator/shared/extract-code-paths";
import {
  decodeCodePathValidationResponse,
  type ValidationEntry,
} from "./codePathValidationResponse";

export type { ValidationEntry } from "./codePathValidationResponse";

export type ValidatedMap = Map<string, ValidationEntry>;

export type CodePathValidation =
  | { status: "pending" }
  | { status: "ready"; validated: ValidatedMap };

/**
 * Posts path candidates from `markdown` to `/api/doc/exists` once per change.
 * Empty candidate set short-circuits with no fetch.
 *
 * `baseDir` is the active document's directory; when set, the server tries
 * `<baseDir>/<input>` before its cwd walk.
 */
export function useValidatedCodePaths(markdown: string, baseDir?: string): CodePathValidation {
  // The state object is the provider value: its identity only changes on transitions.
  const [validation, setValidation] = useState<CodePathValidation>({ status: "pending" });

  useEffect(() => {
    setValidation({ status: "pending" });

    const candidates = extractCandidateCodePaths(markdown);

    if (candidates.length === 0) {
      setValidation({ status: "ready", validated: new Map() });

      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/doc/exists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            baseDir ? { paths: candidates, base: baseDir } : { paths: candidates },
          ),
        });

        if (cancelled) return;

        if (!res.ok) {
          setValidation({ status: "ready", validated: new Map() });

          return;
        }

        const data: unknown = await res.json();

        if (cancelled) return;
        setValidation({ status: "ready", validated: decodeCodePathValidationResponse(data) });
      } catch {
        if (!cancelled) setValidation({ status: "ready", validated: new Map() });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [markdown, baseDir]);

  return validation;
}
