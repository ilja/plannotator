import { useEffect, useState } from "react";
import { extractCandidateCodePaths } from "@plannotator/shared/extract-code-paths";
import {
  decodeCodePathValidationResponse,
  type ValidationEntry,
} from "./codePathValidationResponse";

export type { ValidationEntry } from "./codePathValidationResponse";

export type ValidatedMap = Map<string, ValidationEntry>;

/**
 * Extracts code-file path candidates from `markdown` and posts them to
 * `/api/doc/exists` once per markdown change. The server has typically
 * pre-warmed the file walk at plan/annotate load, so the response is fast.
 *
 * There is no map until `ready`: the hook returns a `pending` state with no
 * `validated` key, and every terminal path (validated response, non-OK,
 * malformed, thrown) lands `ready` with a map — empty when validation
 * produced nothing. The renderer dispatches on status — see InlineMarkdown.
 *
 * Empty candidate set short-circuits — no fetch, ready: true immediately.
 *
 * `baseDir` is the directory the active document lives in (linked-doc parent
 * or the annotate source file's parent). When set, the server tries
 * `<baseDir>/<input>` literal-resolve before its cwd walk so out-of-tree
 * relative references (e.g. `../script.ts` in `~/notes/foo.md`) don't get
 * demoted to plain text.
 */
/**
 * Validation lifecycle: no map exists before ready, so consumers narrow on
 * status instead of reading a possibly-empty map behind a boolean.
 */
export type CodePathValidation =
  | { status: "pending" }
  | { status: "ready"; validated: ValidatedMap };

export function useValidatedCodePaths(markdown: string, baseDir?: string): CodePathValidation {
  // One state: every terminal path lands ready, so ready-without-a-map and
  // map-without-ready are unrepresentable. The state object itself is the
  // provider value, so its identity only changes on transitions and context
  // consumers (every InlineMarkdown) don't re-render spuriously.
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
