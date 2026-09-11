/**
 * External Annotations — shared types, store logic, and SSE helpers.
 *
 * Runtime-agnostic: no node:fs, no node:http, no Bun APIs.
 * Both the Bun server handler and Pi server handler import this module
 * and wrap it with their respective HTTP transport layers.
 *
 * The store is generic — plan servers store Annotation objects,
 * review servers store CodeAnnotation objects. The mode-specific
 * input transformers handle validation and field assignment.
 */

import { Option, Schema } from "effect";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Constraint for any annotation type the store can hold. */
export type StorableAnnotation = { id: string; source?: string };

export type ExternalAnnotationEvent<T = unknown> =
  | { type: "snapshot"; annotations: T[] }
  | { type: "add"; annotations: T[] }
  | { type: "remove"; ids: string[] }
  | { type: "clear"; source?: string }
  | { type: "update"; id: string; annotation: T };

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

/** Heartbeat comment to keep SSE connections alive (sent every 30s). */
export const HEARTBEAT_COMMENT = ":\n\n";

/** Interval in ms between heartbeat comments. */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Encode an event as an SSE `data:` line. */
export function serializeSSEEvent<T>(event: ExternalAnnotationEvent<T>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ---------------------------------------------------------------------------
// Input validation — shared helpers
// ---------------------------------------------------------------------------

export interface ParseError {
  error: string;
}

const ExternalFieldsSchema = Schema.Record(Schema.String, Schema.Unknown);

export type ExternalFields = Schema.Schema.Type<typeof ExternalFieldsSchema>;

const ImageAttachmentSchema = Schema.Struct({
  path: Schema.String,
  name: Schema.String,
});

const ChoiceValidationEvidenceSchema = Schema.Struct({
  question: Schema.String,
  options: Schema.Array(
    Schema.Struct({
      label: Schema.String,
      text: Schema.String,
    }),
  ),
});

const AnnotationMetaSchema = Schema.Struct({
  parentTagName: Schema.String,
  parentIndex: Schema.Number,
  textOffset: Schema.Number,
});

const PlanAnnotationPatchSchema = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.optionalKey(Schema.String),
    source: Schema.optionalKey(Schema.String),
    blockId: Schema.optionalKey(Schema.String),
    startOffset: Schema.optionalKey(Schema.Number),
    endOffset: Schema.optionalKey(Schema.Number),
    type: Schema.optionalKey(Schema.Literals(["DELETION", "COMMENT", "GLOBAL_COMMENT"])),
    text: Schema.optionalKey(Schema.String),
    originalText: Schema.optionalKey(Schema.String),
    createdA: Schema.optionalKey(Schema.Number),
    createdAt: Schema.optionalKey(Schema.Number),
    author: Schema.optionalKey(Schema.String),
    images: Schema.optionalKey(Schema.Array(ImageAttachmentSchema)),
    isQuickLabel: Schema.optionalKey(Schema.Boolean),
    quickLabelTip: Schema.optionalKey(Schema.String),
    choiceOptionLabel: Schema.optionalKey(Schema.String),
    choiceValidationEvidence: Schema.optionalKey(ChoiceValidationEvidenceSchema),
    diffContext: Schema.optionalKey(Schema.Literals(["added", "removed", "modified"])),
    startMeta: Schema.optionalKey(AnnotationMetaSchema),
    endMeta: Schema.optionalKey(AnnotationMetaSchema),
  }),
  [ExternalFieldsSchema],
);

const ReviewAnnotationPatchSchema = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.optionalKey(Schema.String),
    source: Schema.optionalKey(Schema.String),
    type: Schema.optionalKey(Schema.Literals(["comment", "suggestion", "concern"])),
    scope: Schema.optionalKey(Schema.Literals(["line", "file", "general"])),
    filePath: Schema.optionalKey(Schema.String),
    lineStart: Schema.optionalKey(Schema.Number),
    lineEnd: Schema.optionalKey(Schema.Number),
    side: Schema.optionalKey(Schema.Literals(["old", "new"])),
    text: Schema.optionalKey(Schema.String),
    images: Schema.optionalKey(Schema.Array(ImageAttachmentSchema)),
    suggestedCode: Schema.optionalKey(Schema.String),
    originalCode: Schema.optionalKey(Schema.String),
    charStart: Schema.optionalKey(Schema.Number),
    charEnd: Schema.optionalKey(Schema.Number),
    tokenText: Schema.optionalKey(Schema.String),
    createdAt: Schema.optionalKey(Schema.Number),
    author: Schema.optionalKey(Schema.String),
    severity: Schema.optionalKey(Schema.Literals(["important", "nit", "pre_existing"])),
    reasoning: Schema.optionalKey(Schema.String),
    reviewProfileLabel: Schema.optionalKey(Schema.String),
    conventionalLabel: Schema.optionalKey(Schema.String),
    decorations: Schema.optionalKey(Schema.Array(Schema.String)),
    prUrl: Schema.optionalKey(Schema.String),
    prNumber: Schema.optionalKey(Schema.Number),
    prTitle: Schema.optionalKey(Schema.String),
    prRepo: Schema.optionalKey(Schema.String),
    diffScope: Schema.optionalKey(Schema.Literals(["layer", "full-stack"])),
  }),
  [ExternalFieldsSchema],
);

const decodePlanAnnotationPatch = Schema.decodeUnknownOption(PlanAnnotationPatchSchema);

const decodeReviewAnnotationPatch = Schema.decodeUnknownOption(ReviewAnnotationPatchSchema);

export function decodeExternalAnnotationPatch<Input>(
  mode: "plan" | "review",
  value: Input,
): ExternalFields | undefined {
  if (mode === "plan") {
    return Option.getOrUndefined(decodePlanAnnotationPatch(value));
  }

  return Option.getOrUndefined(decodeReviewAnnotationPatch(value));
}

/**
 * Unwrap a POST body into an array of raw input objects.
 *
 * Accepts either:
 *   - A single annotation object: `{ source: "...", ... }`
 *   - A batch wrapper: `{ annotations: [{ source: "...", ... }, ...] }`
 */
function unwrapBody(body: ExternalFields): ExternalFields[] | ParseError {
  const annotationsCandidate = body.annotations;

  // Batch format: { annotations: [...] }
  if (Array.isArray(annotationsCandidate)) {
    if (annotationsCandidate.length === 0) {
      return { error: "annotations array must not be empty" };
    }

    const items: ExternalFields[] = [];

    for (let i = 0; i < annotationsCandidate.length; i++) {
      const item = annotationsCandidate[i];
      const decoded = Option.getOrUndefined(Schema.decodeUnknownOption(ExternalFieldsSchema)(item));

      if (!decoded) {
        return { error: `annotations[${i}] must be an object` };
      }

      items.push(decoded);
    }

    return items;
  }

  // Single format: { source: "...", ... }
  const sourceCandidate = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.String)(body.source),
  );

  if (sourceCandidate) {
    return [body];
  }

  return { error: 'Missing required "source" field or "annotations" array' };
}

function requireString(obj: ExternalFields, field: string, index: number): string | ParseError {
  const decoded = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(obj[field]));

  if (!decoded || decoded.length === 0) {
    return { error: `annotations[${index}] missing required "${field}" field` };
  }

  return decoded;
}

// ---------------------------------------------------------------------------
// Plan mode transformer — produces Annotation objects
// ---------------------------------------------------------------------------

/** The Annotation type shape for plan mode (mirrors packages/ui/types.ts). */
interface PlanAnnotation {
  id: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  type: string; // AnnotationType value
  text?: string;
  originalText: string;
  createdA: number;
  author?: string;
  source?: string;
}

const VALID_PLAN_TYPES = ["DELETION", "COMMENT", "GLOBAL_COMMENT"];

export function transformPlanInput(
  body: ExternalFields,
): { annotations: PlanAnnotation[] } | ParseError {
  const items = unwrapBody(body);

  if (!Array.isArray(items)) return items;

  const annotations: PlanAnnotation[] = [];

  for (let i = 0; i < items.length; i++) {
    const obj = items[i];

    const source = requireString(obj, "source", i);

    if (source instanceof Object) return source;

    // Must have text content
    const textCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.text),
    );

    if (!textCandidate || textCandidate.length === 0) {
      return { error: `annotations[${i}] missing required "text" field` };
    }

    // Validate type if provided, default to GLOBAL_COMMENT
    const typeCandidate =
      Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(obj.type)) ??
      "GLOBAL_COMMENT";

    if (!VALID_PLAN_TYPES.includes(typeCandidate)) {
      return {
        error: `annotations[${i}] invalid type "${typeCandidate}". Must be one of: ${VALID_PLAN_TYPES.join(", ")}`,
      };
    }

    // DELETION requires originalText (the text to remove)
    const originalTextCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.originalText),
    );

    if (
      typeCandidate === "DELETION" &&
      (!originalTextCandidate || originalTextCandidate.length === 0)
    ) {
      return { error: `annotations[${i}] DELETION type requires non-empty "originalText" field` };
    }

    // COMMENT requires originalText so the renderer can pin it to a phrase.
    // External agents that want sidebar-only feedback should use GLOBAL_COMMENT
    // instead — without a phrase to anchor to, a COMMENT renders as an empty
    // quote bubble in the sidebar and exports as `Feedback on: ""`.
    if (
      typeCandidate === "COMMENT" &&
      (!originalTextCandidate || originalTextCandidate.length === 0)
    ) {
      return {
        error: `annotations[${i}] COMMENT requires non-empty "originalText" field. Use GLOBAL_COMMENT for sidebar-only feedback.`,
      };
    }

    const authorCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.author),
    );

    annotations.push({
      id: crypto.randomUUID(),
      blockId: "external",
      startOffset: 0,
      endOffset: 0,
      type: typeCandidate,
      text: textCandidate,
      originalText: originalTextCandidate ?? "",
      createdA: Date.now(),
      author: authorCandidate,
      source,
    });
  }

  return { annotations };
}

// ---------------------------------------------------------------------------
// Review mode transformer — produces CodeAnnotation objects
// ---------------------------------------------------------------------------

/** The CodeAnnotation type shape for review mode (mirrors packages/ui/types.ts). */
interface ReviewAnnotation {
  id: string;
  type: string; // CodeAnnotationType value
  scope?: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  side: string;
  text?: string;
  suggestedCode?: string;
  originalCode?: string;
  createdAt: number;
  author?: string;
  source?: string;
  // Agent review metadata (optional — only set by agent review findings)
  severity?: string; // "important" | "nit" | "pre_existing"
  reasoning?: string; // Validation chain explaining how the issue was confirmed
  reviewProfileLabel?: string; // Custom review profile that produced this finding
}

const VALID_REVIEW_TYPES = ["comment", "suggestion", "concern"];

const VALID_SIDES = ["old", "new"];

const VALID_SCOPES = ["line", "file", "general"];

/** A review finding's placement, derived from what it carries. */
export type FindingPlacement = {
  scope: "line" | "file" | "general";
  filePath: string;
  lineStart: number;
  lineEnd: number;
};

/**
 * Classify an agent review finding by what it carries, so nothing is dropped:
 *   file + a usable line → a line comment
 *   file, no line        → a whole-file comment
 *   neither              → a general (review-level) comment
 *
 * For file and general placements the line is 0; for general the path is "".
 * Consumers branch on `scope`, never on the sentinel values.
 */
export function classifyFindingPlacement(
  filePath: string,
  lineStart: number | null | undefined,
  lineEnd: number | null | undefined,
): FindingPlacement {
  const hasFile = filePath.length > 0;
  const hasLine = lineStart !== null && lineStart !== undefined;

  if (hasFile && hasLine) {
    return {
      scope: "line",
      filePath,
      lineStart,
      lineEnd: lineEnd !== null && lineEnd !== undefined ? lineEnd : lineStart,
    };
  }

  if (hasFile) {
    return { scope: "file", filePath, lineStart: 0, lineEnd: 0 };
  }

  return { scope: "general", filePath: "", lineStart: 0, lineEnd: 0 };
}

interface ReviewInputLocation {
  readonly scope: string;
  readonly filePath: string;
  readonly lineStart: number;
  readonly lineEnd: number;
}

function resolveReviewInputLocation(
  obj: ExternalFields,
  index: number,
): ReviewInputLocation | ParseError {
  const scopeCandidate =
    Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(obj.scope)) ?? "line";

  if (!VALID_SCOPES.includes(scopeCandidate)) {
    return {
      error: `annotations[${index}] invalid scope "${scopeCandidate}". Must be one of: ${VALID_SCOPES.join(", ")}`,
    };
  }

  if (scopeCandidate === "general") {
    return { scope: scopeCandidate, filePath: "", lineStart: 0, lineEnd: 0 };
  }

  const filePath = requireString(obj, "filePath", index);

  if (filePath instanceof Object) return filePath;

  if (scopeCandidate !== "line") {
    return {
      scope: scopeCandidate,
      filePath,
      lineStart:
        Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Number)(obj.lineStart)) ?? 0,
      lineEnd: Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Number)(obj.lineEnd)) ?? 0,
    };
  }

  const lineStart = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Number)(obj.lineStart));

  if (lineStart === undefined) {
    return { error: `annotations[${index}] missing required "lineStart" field` };
  }

  const lineEnd = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Number)(obj.lineEnd));

  if (lineEnd === undefined) {
    return { error: `annotations[${index}] missing required "lineEnd" field` };
  }

  return { scope: scopeCandidate, filePath, lineStart, lineEnd };
}

export function transformReviewInput(
  body: ExternalFields,
): { annotations: ReviewAnnotation[] } | ParseError {
  const items = unwrapBody(body);

  if (!Array.isArray(items)) return items;

  const annotations: ReviewAnnotation[] = [];

  for (let i = 0; i < items.length; i++) {
    const obj = items[i];

    const source = requireString(obj, "source", i);

    if (source instanceof Object) return source;

    const location = resolveReviewInputLocation(obj, i);

    if ("error" in location) return location;

    // side: optional, defaults to "new"
    const sideCandidate =
      Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(obj.side)) ?? "new";

    if (!VALID_SIDES.includes(sideCandidate)) {
      return {
        error: `annotations[${i}] invalid side "${sideCandidate}". Must be one of: ${VALID_SIDES.join(", ")}`,
      };
    }

    // type: optional, defaults to "comment"
    const typeCandidate =
      Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(obj.type)) ?? "comment";

    if (!VALID_REVIEW_TYPES.includes(typeCandidate)) {
      return {
        error: `annotations[${i}] invalid type "${typeCandidate}". Must be one of: ${VALID_REVIEW_TYPES.join(", ")}`,
      };
    }

    // Must have at least text or suggestedCode
    const textCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.text),
    );

    const suggestedCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.suggestedCode),
    );

    if (!textCandidate && !suggestedCandidate) {
      return {
        error: `annotations[${i}] must have at least one of: text, suggestedCode`,
      };
    }

    const originalCodeCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.originalCode),
    );

    const authorCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.author),
    );

    const severityCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.severity),
    );

    const reasoningCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.reasoning),
    );

    const reviewProfileLabelCandidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(Schema.String)(obj.reviewProfileLabel),
    );

    const annotation: ReviewAnnotation = {
      id: crypto.randomUUID(),
      type: typeCandidate,
      scope: location.scope,
      filePath: location.filePath,
      lineStart: location.lineStart,
      lineEnd: location.lineEnd,
      side: sideCandidate,
      text: textCandidate,
      suggestedCode: suggestedCandidate,
      originalCode: originalCodeCandidate,
      createdAt: Date.now(),
      author: authorCandidate,
      source,
    };

    if (severityCandidate) annotation.severity = severityCandidate;

    if (reasoningCandidate) annotation.reasoning = reasoningCandidate;

    if (reviewProfileLabelCandidate) annotation.reviewProfileLabel = reviewProfileLabelCandidate;
    annotations.push(annotation);
  }

  return { annotations };
}

// ---------------------------------------------------------------------------
// Annotation Store (generic)
// ---------------------------------------------------------------------------

type MutationListener<T> = (event: ExternalAnnotationEvent<T>) => void;

export interface AnnotationStore<T extends StorableAnnotation> {
  /** Add fully-formed annotations. Returns the added annotations. */
  add(items: T[]): T[];
  /** Remove an annotation by ID. Returns true if found. */
  remove(id: string): boolean;
  /** Remove all annotations from a specific source. Returns count removed. */
  clearBySource(source: string): number;
  /** Update an annotation by ID. Returns the updated annotation, or null if not found. */
  update(id: string, fields: Partial<T>): T | null;
  /** Remove all annotations. Returns count removed. */
  clearAll(): number;
  /** Get all annotations (snapshot). */
  getAll(): T[];
  /** Monotonic version counter — incremented on every mutation. */
  readonly version: number;
  /** Register a listener for mutation events. Returns unsubscribe function. */
  onMutation(listener: MutationListener<T>): () => void;
}

/**
 * Create an in-memory annotation store.
 *
 * The store is runtime-agnostic — it holds data and emits events.
 * HTTP transport (SSE broadcasting, request parsing) is handled by
 * the server-specific adapter (Bun or Pi).
 */
export function createAnnotationStore<T extends StorableAnnotation>(): AnnotationStore<T> {
  const annotations: T[] = [];
  const listeners = new Set<MutationListener<T>>();
  let version = 0;

  function emit(event: ExternalAnnotationEvent<T>): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Don't let a failing listener break the store
      }
    }
  }

  return {
    add(items) {
      if (items.length > 0) {
        for (const item of items) {
          annotations.push(item);
        }

        version++;
        emit({ type: "add", annotations: items });
      }

      return items;
    },

    remove(id) {
      const idx = annotations.findIndex((a) => a.id === id);

      if (idx === -1) return false;
      annotations.splice(idx, 1);
      version++;
      emit({ type: "remove", ids: [id] });

      return true;
    },

    update(id, fields) {
      const idx = annotations.findIndex((a) => a.id === id);

      if (idx === -1) return null;
      // SAFETY: store holds T; merging Partial<T> + { id } preserves T's shape and id's type.
      const merged = { ...annotations[idx], ...fields, id } as T;
      annotations[idx] = merged;
      version++;
      emit({ type: "update", id, annotation: merged });

      return merged;
    },

    clearBySource(source) {
      const before = annotations.length;

      for (let i = annotations.length - 1; i >= 0; i--) {
        if (annotations[i].source === source) {
          annotations.splice(i, 1);
        }
      }

      const removed = before - annotations.length;

      if (removed > 0) {
        version++;
        emit({ type: "clear", source });
      }

      return removed;
    },

    clearAll() {
      const count = annotations.length;

      if (count > 0) {
        annotations.length = 0;
        version++;
        emit({ type: "clear" });
      }

      return count;
    },

    getAll() {
      return [...annotations];
    },

    get version() {
      return version;
    },

    onMutation(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
