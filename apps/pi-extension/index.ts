/**
 * Plannotator Pi Extension — review and annotation surfaces.
 *
 * Features:
 * - /plannotator-review command for code review
 * - /plannotator-annotate command for markdown/document annotation
 * - /plannotator-last command for assistant-message annotation
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { hasMarkdownFiles, resolveUserPath } from "./generated/resolve-file.js";
import { FILE_BROWSER_EXCLUDED } from "./generated/reference-common.js";
import { htmlToMarkdown } from "./generated/html-to-markdown.js";
import { urlToMarkdown, isConvertedSource } from "./generated/url-to-markdown.js";
import { loadConfig, resolveUseJina } from "./generated/config.js";
import {
	getReviewApprovedPrompt,
	getReviewDeniedSuffix,
	getAnnotateFileFeedbackPrompt,
	getAnnotateMessageFeedbackPrompt,
} from "./generated/prompts.js";
import { parseAnnotateArgs } from "./generated/annotate-args.js";
import { parseReviewArgs } from "./generated/review-args.js";
import { resolveAtReference } from "./generated/at-reference.js";
import {
	hasAnnotationBrowserHtml,
	hasReviewBrowserHtml,
	getStartupErrorMessage,
	startCodeReviewBrowserSession,
	startLastMessageAnnotationSession,
	startMarkdownAnnotationSession,
	registerPlannotatorEventListeners,
} from "./plannotator-events.js";
import {
	findAssistantMessageByEntryId,
	getLastAssistantMessageSnapshot,
	getRecentAssistantMessages,
	hasSessionMovedPastEntry,
} from "./assistant-message.js";
import {
	getPiSessionIdentity,
	isCurrentPiSessionDifferentFrom,
	notifyCurrentPiSession,
	type PiSessionIdentity,
	registerCurrentPiSession,
	sendUserMessageToCurrentPiSession,
	withCurrentPiSessionFallbackHeader,
} from "./current-pi-session.js";
import { isRemoteSession } from "./server/network.js";

function safeNotify(
	ctx: ExtensionContext,
	message: string,
	type: "info" | "warning" | "error" = "info",
	origin?: PiSessionIdentity,
): void {
	try {
		ctx.ui.notify(message, type);
	} catch (err) {
		if (notifyCurrentPiSession(message, type, origin)) return;
		console.error(`Plannotator notification failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/**
 * Foreground "session opened" notice. For a remote session the auto-opened
 * browser is unreachable, so the URL must ride in THIS in-turn message — the
 * after-turn notify inside openBrowserForServer fires too late to render.
 */
function sessionOpenedMessage(label: string, url: string): string {
	return isRemoteSession()
		? `${label} — open ${url} on your local machine (forward the port if needed). You can keep chatting while it runs.`
		: `${label}. You can keep chatting while it runs.`;
}

function reportBackgroundError(ctx: ExtensionContext, message: string, err: unknown, origin?: PiSessionIdentity): void {
	const detail = getStartupErrorMessage(err);
	console.error(`${message}: ${detail}`);
	safeNotify(ctx, `${message}: ${detail}`, "error", origin);
}

function excerptText(text: string, maxChars = 1000): string {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) return trimmed;
	return `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

function blockquote(text: string): string {
	return text
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n");
}

function anchorMessageFeedback(feedback: string, originalMessage: string): string {
	return `This feedback applies to the earlier assistant response excerpted below:

${blockquote(excerptText(originalMessage))}

User feedback:
${feedback}`;
}

function shouldAnchorLastMessageFeedback(ctx: ExtensionContext, entryId: string, origin: PiSessionIdentity): boolean {
	if (isCurrentPiSessionDifferentFrom(origin)) return true;
	try {
		return hasSessionMovedPastEntry(ctx, entryId);
	} catch {
		return true;
	}
}

function reportCurrentSessionSendFailure(errorMessage: string, err: unknown, origin: PiSessionIdentity): void {
	const detail = getStartupErrorMessage(err);
	console.error(`${errorMessage}: ${detail}`);
	notifyCurrentPiSession(`${errorMessage}: ${detail}`, "error", origin);
}

function trySendUserMessageToDifferentCurrentSession(
	content: Parameters<ExtensionAPI["sendUserMessage"]>[0],
	options: Parameters<ExtensionAPI["sendUserMessage"]>[1],
	errorMessage: string,
	origin: PiSessionIdentity,
): boolean {
	const result = sendUserMessageToCurrentPiSession(
		withCurrentPiSessionFallbackHeader(content),
		options,
		origin,
	);
	if (result.ok) return true;
	if (result.reason === "send-failed") {
		reportCurrentSessionSendFailure(errorMessage, result.error, origin);
		return true;
	}
	return false;
}

function sendUserMessageWithCurrentSessionFallback(
	pi: ExtensionAPI,
	content: Parameters<ExtensionAPI["sendUserMessage"]>[0],
	options: Parameters<ExtensionAPI["sendUserMessage"]>[1],
	errorMessage: string,
	origin: PiSessionIdentity,
): void {
	if (trySendUserMessageToDifferentCurrentSession(content, options, errorMessage, origin)) return;

	try {
		pi.sendUserMessage(content, options);
		return;
	} catch (err) {
		if (trySendUserMessageToDifferentCurrentSession(content, options, errorMessage, origin)) return;
		throw err;
	}
}

export default function plannotator(pi: ExtensionAPI): void {
	const currentPiSession = registerCurrentPiSession(pi);
	void registerPlannotatorEventListeners(pi);

	pi.on("session_start", (_event, ctx) => {
		currentPiSession.update(ctx);
	});

	pi.on("session_shutdown", () => {
		currentPiSession.clear();
	});

	pi.registerCommand("plannotator-review", {
		description: "Open interactive code review for current changes or a PR URL; pass --git to force Git in JJ workspaces",
		handler: async (args, ctx) => {
			if (!hasReviewBrowserHtml()) {
				ctx.ui.notify(
					"Code review UI not available. Run 'bun run build' in the pi-extension directory.",
					"error",
				);
				return;
			}

			currentPiSession.update(ctx);
			const origin = getPiSessionIdentity(ctx);

			try {
				const reviewArgs = parseReviewArgs(args ?? "");
				const session = await startCodeReviewBrowserSession(ctx, {
					prUrl: reviewArgs.prUrl,
					vcsType: reviewArgs.vcsType,
					useLocal: reviewArgs.useLocal,
				});
				ctx.ui.notify(sessionOpenedMessage("Code review opened", session.url), "info");
				void session
					.waitForDecision()
					.then((result) => {
						try {
							if (result.exit) {
								safeNotify(ctx, "Code review session closed.", "info", origin);
								return;
							}
							if (result.approved) {
								sendUserMessageWithCurrentSessionFallback(
									pi,
									getReviewApprovedPrompt("pi", loadConfig()),
									{ deliverAs: "followUp" },
									"Plannotator code review feedback could not be sent",
									origin,
								);
								return;
							}
							if (!result.feedback) {
								safeNotify(ctx, "Code review closed (no feedback).", "info", origin);
								return;
							}
							// Append the triage-first suffix when the reviewer sent
							// annotations to act on (PR mode included). Platform PR actions
							// (approve/comment posted to the host) come back with an empty
							// annotation set and a status message — don't tell the agent to
							// "address" a platform action.
							const reviewFeedback = (result.annotations?.length ?? 0) > 0
								? `${result.feedback}${getReviewDeniedSuffix("pi", loadConfig())}`
								: result.feedback;
							sendUserMessageWithCurrentSessionFallback(
								pi,
								reviewFeedback,
								{ deliverAs: "followUp" },
								"Plannotator code review feedback could not be sent",
								origin,
							);
						} catch (err) {
							reportBackgroundError(ctx, "Plannotator code review feedback could not be sent", err, origin);
						}
					})
					.catch((err) => {
						reportBackgroundError(ctx, "Plannotator code review session failed", err, origin);
					});
			} catch (err) {
				ctx.ui.notify(
					`Failed to start code review UI: ${getStartupErrorMessage(err)}`,
					"error",
				);
			}
		},
	});

	pi.registerCommand("plannotator-annotate", {
		description: "Open markdown file or folder in annotation UI",
		handler: async (args, ctx) => {
			// Split known annotate flags from the path. --json is silently
			// accepted (Pi writes back via sendUserMessage, not stdout).
			// `rawFilePath` keeps any leading `@` for the literal-@ fallback
			// (scoped-package-style names).
			const { filePath, rawFilePath, gate, renderMarkdown: renderMarkdownFlag, noJina } = parseAnnotateArgs(args ?? "");
			if (!filePath) {
				ctx.ui.notify("Usage: /plannotator-annotate <file.md | file.txt | file.html | https://... | folder/> [--markdown] [--no-jina] [--gate] [--json]", "error");
				return;
			}
			if (!hasAnnotationBrowserHtml()) {
				ctx.ui.notify(
					"Annotation UI not available. Run 'bun run build' in the pi-extension directory.",
					"error",
				);
				return;
			}

			let markdown: string;
			let rawHtml: string | undefined;
			let absolutePath: string;
			let folderPath: string | undefined;
			let mode: "annotate" | "annotate-folder" | undefined;
			let sourceInfo: string | undefined;
			let sourceConverted = false;
			let isFolder = false;

			// --- URL annotation ---
			const isUrl = /^https?:\/\//i.test(filePath);

			if (isUrl) {
				const useJina = resolveUseJina(noJina, loadConfig());
				ctx.ui.notify(`Fetching: ${filePath}${useJina ? " (via Jina Reader)" : " (via fetch+Turndown)"}...`, "info");
				try {
					const result = await urlToMarkdown(filePath, { useJina });
					markdown = result.markdown;
					sourceConverted = isConvertedSource(result.source);
				} catch (err) {
					ctx.ui.notify(`Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`, "error");
					return;
				}
				absolutePath = filePath;
				sourceInfo = filePath;
			} else {
				// Pick the interpretation of the user input that actually exists:
				// stripped form first (reference-mode primary), literal as fallback
				// for scoped-package-style names. Falls back to the stripped form
				// for the error message if neither exists.
				const resolvedCandidate = resolveAtReference(rawFilePath, (c) => {
					const abs = resolveUserPath(c, ctx.cwd);
					return existsSync(abs);
				});
				if (resolvedCandidate === null) {
					absolutePath = resolveUserPath(filePath, ctx.cwd);
					ctx.ui.notify(`File not found: ${absolutePath}`, "error");
					return;
				}
				absolutePath = resolveUserPath(resolvedCandidate, ctx.cwd);

				try {
					isFolder = statSync(absolutePath).isDirectory();
				} catch {
					ctx.ui.notify(`Cannot access: ${absolutePath}`, "error");
					return;
				}

				if (isFolder) {
					if (!hasMarkdownFiles(absolutePath, FILE_BROWSER_EXCLUDED, /\.(mdx?|txt|html?)$/i)) {
						ctx.ui.notify(`No markdown, text, or HTML files found in ${absolutePath}`, "error");
						return;
					}
					markdown = "";
					folderPath = absolutePath;
					mode = "annotate-folder";
					ctx.ui.notify(`Opening annotation UI for folder ${filePath}...`, "info");
				} else if (/\.html?$/i.test(absolutePath)) {
					const html = readFileSync(absolutePath, "utf-8");
					const renderHtmlForFile = !renderMarkdownFlag;
					if (renderHtmlForFile) {
						rawHtml = html;
						markdown = "";
					} else {
						markdown = htmlToMarkdown(html);
						sourceConverted = true;
					}
					sourceInfo = basename(absolutePath);
					ctx.ui.notify(`Opening annotation UI for ${filePath}...`, "info");
				} else {
					if (!/\.(mdx?|txt)$/i.test(absolutePath)) {
						ctx.ui.notify("Only .md, .mdx, .txt, .html, .htm files are supported.", "error");
						return;
					}
					markdown = readFileSync(absolutePath, "utf-8");
					ctx.ui.notify(`Opening annotation UI for ${filePath}...`, "info");
				}
			}

			currentPiSession.update(ctx);
			const origin = getPiSessionIdentity(ctx);

			try {
				const session = await startMarkdownAnnotationSession(
					ctx,
					absolutePath,
					markdown,
					mode ?? "annotate",
					folderPath,
					sourceInfo,
					sourceConverted,
					gate,
					rawHtml,
					!!rawHtml,
					renderMarkdownFlag,
				);
				ctx.ui.notify(sessionOpenedMessage("Annotation opened", session.url), "info");
				void session
					.waitForDecision()
					.then((result) => {
						try {
							if (result.exit) {
								safeNotify(ctx, "Annotation session closed.", "info", origin);
								return;
							}
							if (result.approved) {
								safeNotify(ctx, "Annotation approved.", "info", origin);
								return;
							}
							if (!result.feedback) {
								safeNotify(ctx, "Annotation closed (no feedback).", "info", origin);
								return;
							}
							sendUserMessageWithCurrentSessionFallback(
								pi,
								getAnnotateFileFeedbackPrompt("pi", loadConfig(), {
									fileHeader: isFolder ? "Folder" : "File",
									filePath: absolutePath,
									feedback: result.feedback,
								}),
								{ deliverAs: "followUp" },
								"Plannotator annotation feedback could not be sent",
								origin,
							);
						} catch (err) {
							reportBackgroundError(ctx, "Plannotator annotation feedback could not be sent", err, origin);
						}
					})
					.catch((err) => {
						reportBackgroundError(ctx, "Plannotator annotation session failed", err, origin);
					});
			} catch (err) {
				ctx.ui.notify(
					`Failed to start annotation UI: ${getStartupErrorMessage(err)}`,
					"error",
				);
			}
		},
	});

	pi.registerCommand("plannotator-last", {
		description: "Annotate the last assistant message",
		handler: async (args, ctx) => {
			// Support --gate on /plannotator-last for the Stop-hook review gate.
			const { gate } = parseAnnotateArgs(args ?? "");

			if (!hasAnnotationBrowserHtml()) {
				ctx.ui.notify(
					"Annotation UI not available. Run 'bun run build' in the pi-extension directory.",
					"error",
				);
				return;
			}

			currentPiSession.update(ctx);
			const origin = getPiSessionIdentity(ctx);

			const snapshot = getLastAssistantMessageSnapshot(ctx);
			if (!snapshot) {
				ctx.ui.notify("No assistant message found in session.", "error");
				return;
			}

			const recent = getRecentAssistantMessages(ctx, 25);
			const pickerMessages = recent.length > 1 ? recent : undefined;

			ctx.ui.notify("Opening annotation UI for last message...", "info");

			try {
				const session = await startLastMessageAnnotationSession(ctx, snapshot.text, gate, pickerMessages);
				ctx.ui.notify(sessionOpenedMessage("Last-message annotation opened", session.url), "info");
				void session
					.waitForDecision()
					.then((result) => {
						try {
							if (result.exit) {
								safeNotify(ctx, "Annotation session closed.", "info", origin);
								return;
							}
							if (result.approved) {
								safeNotify(ctx, "Message approved.", "info", origin);
								return;
							}
							if (!result.feedback) {
								safeNotify(ctx, "Annotation closed (no feedback).", "info", origin);
								return;
							}
							// Picker may have changed which message the feedback targets; if so,
							// look that one up in the current branch so the anchor quote matches.
							const target = result.selectedMessageId && result.selectedMessageId !== snapshot.entryId
								? findAssistantMessageByEntryId(ctx, result.selectedMessageId) ?? snapshot
								: snapshot;
							const feedback = result.feedbackScope !== "messages" && shouldAnchorLastMessageFeedback(ctx, target.entryId, origin)
								? anchorMessageFeedback(result.feedback, target.text)
								: result.feedback;
							sendUserMessageWithCurrentSessionFallback(
								pi,
								getAnnotateMessageFeedbackPrompt("pi", loadConfig(), {
									feedback,
								}),
								{ deliverAs: "followUp" },
								"Plannotator message annotation feedback could not be sent",
								origin,
							);
						} catch (err) {
							reportBackgroundError(ctx, "Plannotator message annotation feedback could not be sent", err, origin);
						}
					})
					.catch((err) => {
						reportBackgroundError(ctx, "Plannotator message annotation session failed", err, origin);
					});
			} catch (err) {
				ctx.ui.notify(
					`Failed to start annotation UI: ${getStartupErrorMessage(err)}`,
					"error",
				);
			}
		},
	});
}
