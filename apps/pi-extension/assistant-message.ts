import { Effect, Option, Schema, SchemaGetter } from "effect";

type AssistantMessageLike = {
  role?: unknown;
  content?: unknown;
};

type SessionEntryLike = {
  id: string;
  type: string;
  timestamp?: unknown;
  message?: AssistantMessageLike;
};

/**
 * The session-branch surface these helpers need. Any Pi ExtensionContext
 * satisfies it; declaring it structurally keeps tests assertion-free and
 * keeps Pi's full context type out of the module's contract.
 */
export type SessionBranchReader = {
  sessionManager: {
    getBranch(): SessionEntryLike[];
  };
  isIdle(): boolean;
};

export type LastAssistantMessageSnapshot = {
  entryId: string;
  text: string;
};

export type RecentAssistantMessage = {
  messageId: string;
  text: string;
  timestamp?: string;
};

// Pi's SDK currently types `SessionEntryBase.timestamp` as `string`, but the
// picker contract everywhere else is ISO and we don't want a silent drift if
// that ever changes. Accept string/number(ms)/Date; drop anything else.
const SessionEntryTimestamp = Schema.Union([Schema.String, Schema.Number, Schema.Date]).pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.checkEffect<string | number | Date>((value) =>
      Effect.succeed(
        Number.isNaN((value instanceof Date ? value : new Date(value)).getTime())
          ? "session entry timestamp is not a parseable date"
          : undefined,
      ),
    ).compose(
      SchemaGetter.transform((value) => {
        const date = value instanceof Date ? value : new Date(value);
        return date.toISOString();
      }),
    ),
    encode: SchemaGetter.transform((iso) => iso),
  }),
);

const AssistantTextBlock = Schema.Struct({
  type: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
});

type AssistantTextBlock = Schema.Schema.Type<typeof AssistantTextBlock>;

/** Assistant message contract for session entries; decodes at the branch boundary. */
export const AssistantMessage = Schema.Struct({
  role: Schema.Literal("assistant"),
  content: Schema.Array(AssistantTextBlock),
});

export type AssistantMessage = Schema.Schema.Type<typeof AssistantMessage>;

export function getAssistantMessageText(message: AssistantMessage): string | null {
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
  return text.trim() ? text : null;
}

function getCurrentBranch(ctx: SessionBranchReader): SessionEntryLike[] {
  return ctx.sessionManager.getBranch();
}

export function getLastAssistantMessageSnapshot(
  ctx: SessionBranchReader,
): LastAssistantMessageSnapshot | null {
  // "Last" means the active conversation branch, not the newest message anywhere
  // in the append-only session file.
  const branch = getCurrentBranch(ctx);
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type !== "message" || !entry.message) continue;
    const parsed = Option.getOrUndefined(
      Schema.decodeUnknownOption(AssistantMessage)(entry.message),
    );
    if (!parsed) continue;
    const text = getAssistantMessageText(parsed);
    if (text) return { entryId: entry.id, text };
  }
  return null;
}

export function getLastAssistantMessageText(ctx: SessionBranchReader): string | null {
  return getLastAssistantMessageSnapshot(ctx)?.text ?? null;
}

export function findAssistantMessageByEntryId(
  ctx: SessionBranchReader,
  entryId: string,
): LastAssistantMessageSnapshot | null {
  const branch = getCurrentBranch(ctx);
  for (const entry of branch) {
    if (entry.id !== entryId || entry.type !== "message" || !entry.message) continue;
    const parsed = Option.getOrUndefined(
      Schema.decodeUnknownOption(AssistantMessage)(entry.message),
    );
    if (!parsed) continue;
    const text = getAssistantMessageText(parsed);
    if (text) return { entryId: entry.id, text };
  }
  return null;
}

export function getRecentAssistantMessages(
  ctx: SessionBranchReader,
  limit: number,
): RecentAssistantMessage[] {
  const branch = getCurrentBranch(ctx);
  const out: RecentAssistantMessage[] = [];
  for (let i = branch.length - 1; i >= 0 && out.length < limit; i--) {
    const entry = branch[i];
    if (entry.type !== "message" || !entry.message) continue;
    const parsed = Option.getOrUndefined(
      Schema.decodeUnknownOption(AssistantMessage)(entry.message),
    );
    if (!parsed) continue;
    const text = getAssistantMessageText(parsed);
    if (!text) continue;
    const timestamp = Option.getOrUndefined(
      Schema.decodeUnknownOption(SessionEntryTimestamp)(entry.timestamp),
    );
    out.push({ messageId: entry.id, text, timestamp });
  }
  return out;
}

export function hasSessionMovedPastEntry(ctx: SessionBranchReader, entryId: string): boolean {
  if (!ctx.isIdle()) return true;

  const branch = getCurrentBranch(ctx);
  const index = branch.findIndex((entry) => entry.id === entryId);
  if (index === -1) return true;

  return branch.slice(index + 1).some((entry) => entry.type === "message");
}
