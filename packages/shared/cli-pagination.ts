

export interface PaginatedArrayResult<T> {
  readonly items: T[];
  readonly rejected: number;
}

/**
 * Parse output of `gh api --paginate` / `glab api --paginate`.
 *
 * Both CLIs concatenate pages as adjacent JSON arrays (`[...][...]`) which is
 * not valid JSON. Walk the output, split it into top-level arrays, and merge
 * them. Single-page output (the common case) round-trips through the same path.
 * Each page member is decoded independently so one malformed API entry does
 * not discard valid siblings.
 */
export function parsePaginatedArray<T>(
  stdout: string,
  decode: <Input>(value: Input) => T | undefined,
): PaginatedArrayResult<T> {
  const trimmed = stdout.trim();
  if (!trimmed) return { items: [], rejected: 0 };

  const slices: string[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;

  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "[" || c === "{") {
      if (depth === 0 && c === "[") start = i;
      depth++;
    } else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0 && c === "]" && start !== -1) {
        slices.push(trimmed.slice(start, i + 1));
        start = -1;
      }
    }
  }

  const pages: unknown[] = slices.length > 0 ? slices.map((slice) => JSON.parse(slice)) : [JSON.parse(trimmed)];
  const items: T[] = [];
  let rejected = 0;

  for (const page of pages) {
    if (!Array.isArray(page)) {
      throw new Error("Expected paginated VCS response to contain arrays");
    }
    for (const entry of page) {
      const decoded = decode(entry);
      if (decoded === undefined) rejected++;
      else items.push(decoded);
    }
  }

  return { items, rejected };
}
