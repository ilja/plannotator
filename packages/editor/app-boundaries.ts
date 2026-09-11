import { Schema } from "effect";
import { AICapabilitiesResponseSchema } from "@plannotator/ai/endpoints";

type JsonInput = Schema.Schema.Type<typeof Schema.Json>;

const OriginSchema = Schema.Literals([
  "claude-code",
  "amp",
  "droid",
  "kiro-cli",
  "opencode",
  "copilot-cli",
  "pi",
  "codex",
  "gemini-cli",
]);

const SourceSaveCapabilitySchema = Schema.Union([
  Schema.Struct({
    enabled: Schema.Literal(true),
    kind: Schema.Literal("local-text-file"),
    scope: Schema.Literals(["single-file", "folder-file"]),
    path: Schema.String,
    basename: Schema.String,
    language: Schema.Literals(["markdown", "mdx", "text"]),
    hash: Schema.String,
    mtimeMs: Schema.Number,
    size: Schema.Number,
    eol: Schema.Literals(["lf", "crlf", "mixed", "none"]),
  }),
  Schema.Struct({
    enabled: Schema.Literal(false),
    reason: Schema.Literals([
      "not-annotate-mode",
      "not-local-file",
      "unsupported-extension",
      "converted-source",
      "html-render",
      "folder-mode",
      "message-mode",
      "shared-session",
      "missing-file",
      "unreadable-file",
    ]),
  }),
]);

const AgentTerminalCapabilitySchema = Schema.Union([
  Schema.Struct({
    enabled: Schema.Literal(true),
    cwd: Schema.String,
    wsPath: Schema.String,
    agents: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        available: Schema.Boolean,
      }),
    ),
  }),
  Schema.Struct({
    enabled: Schema.Literal(false),
    reason: Schema.Literals([
      "not-annotate-mode",
      "remote-disabled",
      "runtime-unavailable",
      "webtui-unavailable",
      "pty-unavailable",
      "unsupported-runtime",
    ]),
    message: Schema.optionalKey(Schema.String),
  }),
]);

const PickerMessageSchema = Schema.Struct({
  messageId: Schema.String,
  text: Schema.String,
  timestamp: Schema.optionalKey(Schema.String),
});

export const PlanResponseSchema = Schema.Struct({
  plan: Schema.optionalKey(Schema.Union([Schema.String, Schema.Null])),
  origin: Schema.optionalKey(OriginSchema),
  mode: Schema.optionalKey(Schema.Literals(["annotate", "annotate-last", "annotate-folder"])),
  filePath: Schema.optionalKey(Schema.String),
  sourceInfo: Schema.optionalKey(Schema.String),
  sourceConverted: Schema.optionalKey(Schema.Boolean),
  sourceSave: Schema.optionalKey(SourceSaveCapabilitySchema),
  gate: Schema.optionalKey(Schema.Boolean),
  renderAs: Schema.optionalKey(Schema.Literals(["html", "markdown"])),
  rawHtml: Schema.optionalKey(Schema.String),
  shareHtml: Schema.optionalKey(Schema.String),
  convertHtml: Schema.optionalKey(Schema.Boolean),
  sharingEnabled: Schema.optionalKey(Schema.Boolean),
  shareBaseUrl: Schema.optionalKey(Schema.String),
  pasteApiUrl: Schema.optionalKey(Schema.String),
  repoInfo: Schema.optionalKey(
    Schema.Struct({
      display: Schema.String,
      branch: Schema.optionalKey(Schema.String),
      host: Schema.optionalKey(Schema.String),
    }),
  ),
  projectRoot: Schema.optionalKey(Schema.String),
  serverConfig: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  recentMessages: Schema.optionalKey(Schema.Array(PickerMessageSchema)),
  agentTerminal: Schema.optionalKey(AgentTerminalCapabilitySchema),
});

export const ShareHtmlResponseSchema = Schema.Struct({
  shareHtml: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
});

const IntegrationResultSchema = Schema.Struct({
  success: Schema.Boolean,
  error: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
});

export const SaveNotesResponseSchema = Schema.Struct({
  results: Schema.optionalKey(
    Schema.Struct({
      obsidian: Schema.optionalKey(IntegrationResultSchema),
    }),
  ),
});

export type PlanResponse = Schema.Schema.Type<typeof PlanResponseSchema>;

export type ShareHtmlResponse = Schema.Schema.Type<typeof ShareHtmlResponseSchema>;

export type SaveNotesResponse = Schema.Schema.Type<typeof SaveNotesResponseSchema>;

export type AICapabilitiesResponse = Schema.Schema.Type<typeof AICapabilitiesResponseSchema>;

export function parsePlanResponse(input: JsonInput): PlanResponse {
  return Schema.decodeUnknownSync(PlanResponseSchema)(input);
}

export function parseShareHtmlResponse(input: JsonInput): ShareHtmlResponse {
  return Schema.decodeUnknownSync(ShareHtmlResponseSchema)(input);
}

export function parseSaveNotesResponse(input: JsonInput): SaveNotesResponse {
  return Schema.decodeUnknownSync(SaveNotesResponseSchema)(input);
}

export function parseAICapabilitiesResponse(input: JsonInput): AICapabilitiesResponse {
  return Schema.decodeUnknownSync(AICapabilitiesResponseSchema)(input);
}
