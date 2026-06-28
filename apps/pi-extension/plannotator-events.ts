import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DiffType, VcsSelection } from "./server.js";
import { getRecentAssistantMessages } from "./assistant-message.js";
import {
	getLastAssistantMessageText,
	getStartupErrorMessage,
	openCodeReview,
	openLastMessageAnnotation,
	openMarkdownAnnotation,
	startCodeReviewBrowserSession,
	startLastMessageAnnotationSession,
	startMarkdownAnnotationSession,
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
	annotations?: unknown[];
	agentSwitch?: string;
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
	"code-review": PlannotatorRequestBase<"code-review", PlannotatorCodeReviewPayload, PlannotatorCodeReviewResult>;
	annotate: PlannotatorRequestBase<"annotate", PlannotatorAnnotatePayload, PlannotatorAnnotationResult>;
	"annotate-last": PlannotatorRequestBase<"annotate-last", PlannotatorAnnotatePayload, PlannotatorAnnotationResult>;
};
export type PlannotatorRequest = PlannotatorRequestMap[PlannotatorAction];
export type PlannotatorResponseMap = {
	"code-review": PlannotatorResponse<PlannotatorCodeReviewResult>;
	annotate: PlannotatorResponse<PlannotatorAnnotationResult>;
	"annotate-last": PlannotatorResponse<PlannotatorAnnotationResult>;
};

function isPlannotatorAction(value: unknown): value is PlannotatorAction {
	return value === "code-review" || value === "annotate" || value === "annotate-last";
}

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

export function registerPlannotatorEventListeners(pi: ExtensionAPI): void {
	const activeSessionContext = createActiveSessionContext();

	// Plannotator event requests are handled against the latest active session.
	// The active context is intentionally session-scoped and replaced on each session_start.
	pi.on("session_start", async (_event, ctx) => {
		activeSessionContext.set(ctx);
	});
	pi.events.on(PLANNOTATOR_REQUEST_CHANNEL, async (data) => {
		const request = data as Partial<PlannotatorRequest> | null;
		const ctx = activeSessionContext.get();

		if (!request || typeof request.respond !== "function" || !isPlannotatorAction(request.action)) {
			return;
		}

		try {
			if (!ctx) {
				request.respond({ status: "unavailable", error: "Plannotator context is not ready yet." });
				return;
			}

			switch (request.action) {
				case "code-review": {
					const result = await openCodeReview(ctx, {
						cwd: request.payload?.cwd,
						defaultBranch: request.payload?.defaultBranch,
						diffType: request.payload?.diffType,
						vcsType: request.payload?.vcsType,
						useLocal: request.payload?.useLocal,
						prUrl: request.payload?.prUrl,
					});
					request.respond({ status: "handled", result });
					return;
				}
				case "annotate": {
					const payload = request.payload;
					if (!payload?.filePath) {
						request.respond({ status: "error", error: "Missing filePath for annotate request." });
						return;
					}
					const sourceConverted = /\.html?$/i.test(payload.filePath) || /^https?:\/\//i.test(payload.filePath);
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
					return;
				}
				case "annotate-last": {
					const payload = request.payload;
					const usePayloadText = !!payload?.markdown?.trim();
					const lastText = usePayloadText ? payload!.markdown! : getLastAssistantMessageText(ctx);
					if (!lastText) {
						request.respond({ status: "unavailable", error: "No assistant message found in session." });
						return;
					}
					const recent = usePayloadText ? [] : getRecentAssistantMessages(ctx, 25);
					const pickerMessages = recent.length > 1 ? recent : undefined;
					const result = await openLastMessageAnnotation(ctx, lastText, payload?.gate, pickerMessages);
					request.respond({ status: "handled", result });
					return;
				}
			}
		} catch (err) {
			const message = getStartupErrorMessage(err);
			if (/unavailable|not available/i.test(message)) {
				request.respond({ status: "unavailable", error: message });
				return;
			}
			request.respond({ status: "error", error: message });
		}
	});
}

export {
	getLastAssistantMessageText,
	hasAnnotationBrowserHtml,
	hasPlanBrowserHtml,
	hasReviewBrowserHtml,
	startCodeReviewBrowserSession,
	startLastMessageAnnotationSession,
	startMarkdownAnnotationSession,
	getStartupErrorMessage,
	openCodeReview,
	openLastMessageAnnotation,
	openMarkdownAnnotation,
} from "./plannotator-browser.js";
