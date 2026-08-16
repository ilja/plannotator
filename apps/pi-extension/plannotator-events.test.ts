import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { registerPlannotatorEventListeners } from "./plannotator-events";

type SessionCtx = {
	sessionManager: { getBranch(): unknown[] };
	isIdle(): boolean;
};

// The SDK delivers arbitrary values on the channel; this is its own handler
// contract, kept verbatim so the test double mirrors production input.
type ChannelHandler = Parameters<ExtensionAPI["events"]["on"]>[1];

type SessionStartHandler = (event: SessionStartEvent, ctx: SessionCtx) => void;

type ChannelResponse = {
	status: "handled" | "unavailable" | "error";
	error?: string;
	result?: unknown;
};

function createFakePi() {
	let sessionStartHandler: SessionStartHandler = () => {};
	let channelHandler: ChannelHandler = () => {};

	const api = {
		on: (event: string, handler: SessionStartHandler) => {
			if (event === "session_start") sessionStartHandler = handler;
		},
		events: {
			on: (channel: string, handler: ChannelHandler) => {
				channelHandler = handler;
				return () => {};
			},
		},
	};

	// SAFETY: test double covering only the on/events.on surface that
	// registerPlannotatorEventListeners touches; ExtensionAPI has many other members.
	return {
		api: api as ExtensionAPI,
		handlers: {
			get sessionStart() {
				return sessionStartHandler;
			},
			get channel() {
				return channelHandler;
			},
		},
	};
}

function respondSpy() {
	const responses: ChannelResponse[] = [];
	return {
		responses,
		respond: (response: ChannelResponse) => {
			responses.push(response);
		},
	};
}

function fakeSessionCtx(): SessionCtx {
	return {
		sessionManager: {
			getBranch: () => [],
		},
		isIdle: () => true,
	};
}

// SAFETY: the production session_start handler ignores the event and only
// stores the ctx; the tested paths never inspect other event fields.
const sessionStartEvent = {} as SessionStartEvent;

describe("plannotator request channel", () => {
	test("silently ignores non-object channel data", async () => {
		const { api, handlers } = createFakePi();
		registerPlannotatorEventListeners(api);
		const { responses, respond } = respondSpy();

		await handlers.channel("not an object");
		await handlers.channel(42);
		await handlers.channel(null);
		await handlers.channel({ action: "code-review2", respond });

		expect(responses).toEqual([]);
	});

	test("silently ignores requests without a respond callback", async () => {
		const { api, handlers } = createFakePi();
		registerPlannotatorEventListeners(api);

		expect(
			await handlers.channel({ action: "annotate", payload: { filePath: "x.ts" } }),
		).toBeUndefined();
	});

	test("silently ignores requests with wrong-typed payload fields", async () => {
		const { api, handlers } = createFakePi();
		registerPlannotatorEventListeners(api);
		const { responses, respond } = respondSpy();

		await handlers.channel({
			action: "annotate",
			payload: { filePath: "x.ts", mode: "custom-mode" },
			respond,
		});

		expect(responses).toEqual([]);
	});

	test("responds unavailable when no active session context exists", async () => {
		const { api, handlers } = createFakePi();
		registerPlannotatorEventListeners(api);
		const { responses, respond } = respondSpy();

		await handlers.channel({
			action: "annotate",
			payload: { filePath: "x.ts" },
			respond,
		});

		expect(responses).toEqual([
			{ status: "unavailable", error: "Plannotator context is not ready yet." },
		]);
	});

	test("responds error when an annotate request has no filePath", async () => {
		const { api, handlers } = createFakePi();
		registerPlannotatorEventListeners(api);
		handlers.sessionStart(sessionStartEvent, fakeSessionCtx());
		const { responses, respond } = respondSpy();

		await handlers.channel({ action: "annotate", respond });

		expect(responses).toEqual([
			{ status: "error", error: "Missing filePath for annotate request." },
		]);
	});

	test("responds unavailable when annotate-last finds no assistant message", async () => {
		const { api, handlers } = createFakePi();
		registerPlannotatorEventListeners(api);
		handlers.sessionStart(sessionStartEvent, fakeSessionCtx());
		const { responses, respond } = respondSpy();

		await handlers.channel({ action: "annotate-last", respond });

		expect(responses).toEqual([
			{ status: "unavailable", error: "No assistant message found in session." },
		]);
	});

	test("decodes a valid code-review request up to the context guard", async () => {
		const { api, handlers } = createFakePi();
		registerPlannotatorEventListeners(api);
		const { responses, respond } = respondSpy();

		await handlers.channel({
			action: "code-review",
			payload: { diffType: "staged", cwd: "/tmp/project" },
			respond,
		});

		expect(responses).toEqual([
			{ status: "unavailable", error: "Plannotator context is not ready yet." },
		]);
	});
});