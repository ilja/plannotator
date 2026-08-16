import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";
import {
	AssistantMessage,
	getAssistantMessageText,
	getLastAssistantMessageSnapshot,
	getRecentAssistantMessages,
	type SessionBranchReader,
} from "./assistant-message";

type FixtureEntry = {
	id: string;
	type: string;
	timestamp?: unknown;
	message?: {
		role?: unknown;
		content?: unknown;
	};
};

function assistantEntry(
	id: string,
	text: string,
	timestamp?: string | number | Date,
): FixtureEntry {
	return {
		id,
		type: "message",
		timestamp,
		message: { role: "assistant", content: [{ type: "text", text }] },
	};
}

function fakeCtx(branch: FixtureEntry[]): SessionBranchReader {
	return { sessionManager: { getBranch: () => branch } };
}

describe("getAssistantMessageText", () => {
	test("extracts text blocks and joins them", () => {
		const parsed = Option.getOrUndefined(
			Schema.decodeUnknownOption(AssistantMessage)({
				role: "assistant",
				content: [
					{ type: "text", text: "a" },
					{ type: "text", text: "b" },
				],
			}),
		);

		expect(parsed !== undefined && getAssistantMessageText(parsed)).toBe("a\nb");
	});

	test("skips non-text blocks", () => {
		const parsed = Option.getOrUndefined(
			Schema.decodeUnknownOption(AssistantMessage)({
				role: "assistant",
				content: [
					{ type: "tool_call", name: "x" },
					{ type: "text", text: "only" },
				],
			}),
		);

		expect(parsed !== undefined && getAssistantMessageText(parsed)).toBe("only");
	});

	test("rejects non-assistant roles at the boundary", () => {
		const parsed = Option.getOrUndefined(
			Schema.decodeUnknownOption(AssistantMessage)({
				role: "user",
				content: [{ type: "text", text: "hi" }],
			}),
		);

		expect(parsed).toBeUndefined();
	});

	test("rejects non-array content at the boundary", () => {
		const parsed = Option.getOrUndefined(
			Schema.decodeUnknownOption(AssistantMessage)({ role: "assistant", content: "text" }),
		);

		expect(parsed).toBeUndefined();
	});

	test("rejects non-object input at the boundary", () => {
		expect(Option.getOrUndefined(Schema.decodeUnknownOption(AssistantMessage)("hi"))).toBeUndefined();
		expect(Option.getOrUndefined(Schema.decodeUnknownOption(AssistantMessage)(null))).toBeUndefined();
	});

	test("returns null when the extracted text is only whitespace", () => {
		const parsed = Option.getOrUndefined(
			Schema.decodeUnknownOption(AssistantMessage)({
				role: "assistant",
				content: [{ type: "text", text: "   " }],
			}),
		);

		expect(parsed !== undefined && getAssistantMessageText(parsed)).toBeNull();
	});
});

describe("getLastAssistantMessageSnapshot", () => {
	test("returns the newest assistant message with text", () => {
		const ctx = fakeCtx([
			assistantEntry("e1", "first"),
			{ id: "tool", type: "tool-call" },
			assistantEntry("e2", "second"),
		]);

		expect(getLastAssistantMessageSnapshot(ctx)).toEqual({ entryId: "e2", text: "second" });
	});

	test("skips assistant messages without text", () => {
		const ctx = fakeCtx([
			assistantEntry("e1", ""),
			{ id: "e2", type: "message", message: { role: "user", content: [] } },
			assistantEntry("e3", "real"),
		]);

		expect(getLastAssistantMessageSnapshot(ctx)).toEqual({ entryId: "e3", text: "real" });
	});

	test("returns null when the branch has no assistant text", () => {
		const ctx = fakeCtx([{ id: "e1", type: "message", message: { role: "user" } }]);

		expect(getLastAssistantMessageSnapshot(ctx)).toBeNull();
	});
});

describe("getRecentAssistantMessages", () => {
	test("returns newest-first assistant messages up to the limit", () => {
		const ctx = fakeCtx([
			assistantEntry("e1", "oldest"),
			assistantEntry("e2", "middle"),
			assistantEntry("e3", "newest"),
		]);

		expect(getRecentAssistantMessages(ctx, 2)).toEqual([
			{ messageId: "e3", text: "newest", timestamp: undefined },
			{ messageId: "e2", text: "middle", timestamp: undefined },
		]);
	});

	test("normalizes ISO string timestamps", () => {
		const ctx = fakeCtx([assistantEntry("e1", "hi", "2024-01-02T03:04:05.000Z")]);

		expect(getRecentAssistantMessages(ctx, 1)).toEqual([
			{ messageId: "e1", text: "hi", timestamp: "2024-01-02T03:04:05.000Z" },
		]);
	});

	test("normalizes epoch-millisecond number timestamps", () => {
		const ctx = fakeCtx([assistantEntry("e1", "hi", 1704164645000)]);

		expect(getRecentAssistantMessages(ctx, 1)).toEqual([
			{ messageId: "e1", text: "hi", timestamp: "2024-01-02T03:04:05.000Z" },
		]);
	});

	test("normalizes Date timestamps", () => {
		const ctx = fakeCtx([assistantEntry("e1", "hi", new Date("2024-01-02T03:04:05.000Z"))]);

		expect(getRecentAssistantMessages(ctx, 1)).toEqual([
			{ messageId: "e1", text: "hi", timestamp: "2024-01-02T03:04:05.000Z" },
		]);
	});

	test("drops unparseable timestamps", () => {
		const ctx = fakeCtx([
			assistantEntry("e1", "hi", "not-a-date"),
			assistantEntry("e2", "hi2", new Date("invalid")),
			{
				id: "e3",
				type: "message",
				timestamp: { weird: true },
				message: { role: "assistant", content: [{ type: "text", text: "hi3" }] },
			},
		]);

		expect(getRecentAssistantMessages(ctx, 3)).toEqual([
			{ messageId: "e3", text: "hi3", timestamp: undefined },
			{ messageId: "e2", text: "hi2", timestamp: undefined },
			{ messageId: "e1", text: "hi", timestamp: undefined },
		]);
	});

	test("drops empty and whitespace-only timestamp strings", () => {
		const ctx = fakeCtx([
			assistantEntry("e1", "hi", ""),
			assistantEntry("e2", "hi2", "   "),
		]);

		expect(getRecentAssistantMessages(ctx, 2)).toEqual([
			{ messageId: "e2", text: "hi2", timestamp: undefined },
			{ messageId: "e1", text: "hi", timestamp: undefined },
		]);
	});

	test("keeps timestamp 0 as the epoch", () => {
		const ctx = fakeCtx([assistantEntry("e1", "hi", 0)]);

		expect(getRecentAssistantMessages(ctx, 1)).toEqual([
			{ messageId: "e1", text: "hi", timestamp: "1970-01-01T00:00:00.000Z" },
		]);
	});
});
