import { Option, Schema } from "effect";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DiffType, VcsSelection } from "./server.js";
import { getRecentAssistantMessages } from "./assistant-message.js";
import { DiffTypeSchema } from "./server/request-schemas.js";
import {
  getLastAssistantMessageText,
  getStartupErrorMessage,
  openCodeReview,
  openLastMessageAnnotation,
  openMarkdownAnnotation,
} from "./plannotator-browser.js";

export const PLANNOTATOR_REQUEST_CHANNEL = "plannotator:request" as const;
export const PLANNOTATOR_TIMEOUT_MS = 5_000;

export type PlannotatorAction = "code-review" | "annotate" | "annotate-last";

export interface PlannotatorHandledResponse<T> {
  status: "handled";
  result: T;
}

export interface PlannotatorUnavailableResponse {
  status: "unavailable";
  error?: string;
}

export interface PlannotatorErrorResponse {
  status: "error";
  error: string;
}

export type PlannotatorResponse<T> =
  | PlannotatorHandledResponse<T>
  | PlannotatorUnavailableResponse
  | PlannotatorErrorResponse;

export interface PlannotatorRequestBase<A extends PlannotatorAction, P, R> {
  requestId: string;
  action: A;
  payload: P;
  respond: (response: PlannotatorResponse<R>) => void;
}

export interface PlannotatorCodeReviewPayload {
  diffType?: DiffType;
  defaultBranch?: string;
  vcsType?: VcsSelection;
  useLocal?: boolean;
  cwd?: string;
  prUrl?: string;
}

export interface PlannotatorCodeReviewResult {
  approved: boolean;
  feedback?: string;
  annotations?: readonly unknown[];
}

export interface PlannotatorAnnotatePayload {
  filePath: string;
  markdown?: string;
  mode?: "annotate" | "annotate-folder" | "annotate-last";
  folderPath?: string;
  /** Enable review-gate UX (Approve / Annotate / Close). */
  gate?: boolean;
}

export interface PlannotatorAnnotationResult {
  feedback: string;
  /** True when the reviewer closed the session without providing feedback. */
  exit?: boolean;
  /** True when the reviewer clicked Approve in review-gate mode. */
  approved?: boolean;
}

export type PlannotatorRequestMap = {
  "code-review": PlannotatorRequestBase<
    "code-review",
    PlannotatorCodeReviewPayload,
    PlannotatorCodeReviewResult
  >;
  annotate: PlannotatorRequestBase<
    "annotate",
    PlannotatorAnnotatePayload,
    PlannotatorAnnotationResult
  >;
  "annotate-last": PlannotatorRequestBase<
    "annotate-last",
    PlannotatorAnnotatePayload,
    PlannotatorAnnotationResult
  >;
};
export type PlannotatorRequest = PlannotatorRequestMap[PlannotatorAction];
export type PlannotatorResponseMap = {
  "code-review": PlannotatorResponse<PlannotatorCodeReviewResult>;
  annotate: PlannotatorResponse<PlannotatorAnnotationResult>;
  "annotate-last": PlannotatorResponse<PlannotatorAnnotationResult>;
};

// Channel contract ("Supported actions and payloads" in README): each action is a
// request/response flow; senders provide a respond callback. `respond` cannot be
// validated as callable by a schema (no Function schema), so it is accepted as
// `Schema.Any` and guarded nullish at the handler.
const PlannotatorCodeReviewPayloadSchema = Schema.Struct({
  diffType: Schema.optionalKey(DiffTypeSchema),
  defaultBranch: Schema.optionalKey(Schema.String),
  vcsType: Schema.optionalKey(Schema.Literals(["auto", "git", "jj", "p4"])),
  useLocal: Schema.optionalKey(Schema.Boolean),
  cwd: Schema.optionalKey(Schema.String),
  prUrl: Schema.optionalKey(Schema.String),
});

const PlannotatorAnnotatePayloadSchema = Schema.Struct({
  filePath: Schema.String,
  markdown: Schema.optionalKey(Schema.String),
  mode: Schema.optionalKey(Schema.Literals(["annotate", "annotate-folder", "annotate-last"])),
  folderPath: Schema.optionalKey(Schema.String),
  gate: Schema.optionalKey(Schema.Boolean),
});

const PlannotatorAnnotateLastPayloadSchema = Schema.Struct({
  markdown: Schema.optionalKey(Schema.String),
  gate: Schema.optionalKey(Schema.Boolean),
});

// Discriminated on `action`, so the handler's switch narrows payload per case.
const PlannotatorRequestMessage = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("code-review"),
    payload: Schema.optionalKey(PlannotatorCodeReviewPayloadSchema),
    respond: Schema.Any,
  }),
  Schema.Struct({
    action: Schema.Literal("annotate"),
    payload: Schema.optionalKey(PlannotatorAnnotatePayloadSchema),
    respond: Schema.Any,
  }),
  Schema.Struct({
    action: Schema.Literal("annotate-last"),
    payload: Schema.optionalKey(PlannotatorAnnotateLastPayloadSchema),
    respond: Schema.Any,
  }),
]);

function createActiveSessionContext() {
  let currentCtx: ExtensionContext | undefined;

  return {
    set(ctx: ExtensionContext): void {
      currentCtx = ctx;
    },
    clear(): void {
      currentCtx = undefined;
    },
    get(): ExtensionContext | undefined {
      return currentCtx;
    },
  };
}

type DecodedPlannotatorRequest = Schema.Schema.Type<typeof PlannotatorRequestMessage>;

async function handleCodeReviewRequest(
  ctx: ExtensionContext,
  request: Extract<DecodedPlannotatorRequest, { action: "code-review" }>,
): Promise<void> {
  const result = await openCodeReview(ctx, {
    cwd: request.payload?.cwd,
    defaultBranch: request.payload?.defaultBranch,
    diffType: request.payload?.diffType,
    vcsType: request.payload?.vcsType,
    useLocal: request.payload?.useLocal,
    prUrl: request.payload?.prUrl,
  });
  request.respond({ status: "handled", result });
}

async function handleAnnotateRequest(
  ctx: ExtensionContext,
  request: Extract<DecodedPlannotatorRequest, { action: "annotate" }>,
): Promise<void> {
  const payload = request.payload;
  if (!payload?.filePath) {
    request.respond({ status: "error", error: "Missing filePath for annotate request." });
    return;
  }
  const sourceConverted =
    /\.html?$/i.test(payload.filePath) || /^https?:\/\//i.test(payload.filePath);
  const result = await openMarkdownAnnotation(
    ctx,
    payload.filePath,
    payload.markdown ?? "",
    payload.mode ?? "annotate",
    payload.folderPath,
    undefined,
    sourceConverted,
    payload.gate,
  );
  request.respond({ status: "handled", result });
}

async function handleAnnotateLastRequest(
  ctx: ExtensionContext,
  request: Extract<DecodedPlannotatorRequest, { action: "annotate-last" }>,
): Promise<void> {
  const payloadText = request.payload?.markdown;
  const lastText = payloadText?.trim() ? payloadText : getLastAssistantMessageText(ctx);
  if (!lastText) {
    request.respond({
      status: "unavailable",
      error: "No assistant message found in session.",
    });
    return;
  }
  const recent = payloadText?.trim() ? [] : getRecentAssistantMessages(ctx, 25);
  const pickerMessages = recent.length > 1 ? recent : undefined;
  const result = await openLastMessageAnnotation(
    ctx,
    lastText,
    request.payload?.gate,
    pickerMessages,
  );
  request.respond({ status: "handled", result });
}

async function handlePlannotatorRequest(
  ctx: ExtensionContext,
  request: DecodedPlannotatorRequest,
): Promise<void> {
  switch (request.action) {
    case "code-review":
      await handleCodeReviewRequest(ctx, request);
      return;
    case "annotate":
      await handleAnnotateRequest(ctx, request);
      return;
    case "annotate-last":
      await handleAnnotateLastRequest(ctx, request);
      return;
  }
}

function respondToRequestFailure(
  respond: DecodedPlannotatorRequest["respond"],
  error: Error,
): void {
  const message = getStartupErrorMessage(error);
  if (/unavailable|not available/i.test(message)) {
    respond({ status: "unavailable", error: message });
    return;
  }
  respond({ status: "error", error: message });
}

export function registerPlannotatorEventListeners(pi: ExtensionAPI): void {
  const activeSessionContext = createActiveSessionContext();

  // Plannotator event requests are handled against the latest active session.
  // The active context is intentionally session-scoped and replaced on each session_start.
  pi.on("session_start", async (_event, ctx) => {
    activeSessionContext.set(ctx);
  });
  pi.events.on(PLANNOTATOR_REQUEST_CHANNEL, async (data) => {
    const request = Option.getOrUndefined(
      Schema.decodeUnknownOption(PlannotatorRequestMessage)(data),
    );
    if (!request || request.respond == null) return;
    const ctx = activeSessionContext.get();

    try {
      if (!ctx) {
        request.respond({ status: "unavailable", error: "Plannotator context is not ready yet." });
        return;
      }
      await handlePlannotatorRequest(ctx, request);
    } catch (err) {
      respondToRequestFailure(request.respond, err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export {
  getLastAssistantMessageText,
  hasAnnotationBrowserHtml,
  hasReviewBrowserHtml,
  startCodeReviewBrowserSession,
  startLastMessageAnnotationSession,
  startMarkdownAnnotationSession,
  getStartupErrorMessage,
  openCodeReview,
  openLastMessageAnnotation,
  openMarkdownAnnotation,
} from "./plannotator-browser.js";
