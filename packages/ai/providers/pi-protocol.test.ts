import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";
import {
  PiModelsResponseSchema,
  PiResponseEnvelopeSchema,
  PiResponseSchema,
  PiSDKConfigSchema,
  PiStateResponseSchema,
} from "./pi-protocol.ts";

describe("Pi RPC protocol schemas", () => {
  test("decodes successful responses with object and null data", () => {
    const success = Schema.decodeUnknownSync(PiResponseSchema)({
      type: "response",
      id: "request-1",
      success: true,
      data: { sessionId: "session-1" },
    });

    const nullData = Schema.decodeUnknownSync(PiResponseSchema)({
      type: "response",
      id: "request-2",
      success: true,
      data: null,
    });

    expect(success.data).toEqual({ sessionId: "session-1" });
    expect(nullData.data).toBeNull();
  });

  test("recognizes response envelopes when the payload is malformed", () => {
    expect(
      Schema.decodeUnknownSync(PiResponseEnvelopeSchema)({
        type: "response",
        id: "request-4",
      }),
    ).toEqual({ type: "response", id: "request-4" });
  });

  test("decodes error responses and rejects malformed envelopes", () => {
    const error = Schema.decodeUnknownSync(PiResponseSchema)({
      type: "response",
      id: "request-3",
      success: false,
      error: "Unknown command",
    });

    expect(error.error).toBe("Unknown command");
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PiResponseSchema)({
          type: "response",
          id: 42,
          success: true,
        }),
      ),
    ).toBeUndefined();
  });

  test("decodes model lists and rejects malformed model entries", () => {
    const models = Schema.decodeUnknownSync(PiModelsResponseSchema)({
      models: [
        { provider: "anthropic", id: "claude", name: "Claude" },
        { provider: "openai", id: "gpt" },
      ],
    });

    expect(models.models).toHaveLength(2);
    expect(models.models[1]?.name).toBeUndefined();
    expect(
      Option.getOrUndefined(
        Schema.decodeUnknownOption(PiModelsResponseSchema)({
          models: [{ provider: "anthropic", id: 42 }],
        }),
      ),
    ).toBeUndefined();
  });

  test("decodes optional state and provider configuration payloads", () => {
    expect(Schema.decodeUnknownSync(PiStateResponseSchema)({})).toEqual({});
    expect(Schema.decodeUnknownSync(PiStateResponseSchema)({ sessionId: "session-4" })).toEqual({
      sessionId: "session-4",
    });
    expect(
      Schema.decodeUnknownSync(PiSDKConfigSchema)({
        type: "pi-sdk",
        cwd: "/tmp/repo",
        model: "anthropic/claude",
        piExecutablePath: "/usr/local/bin/pi",
      }),
    ).toMatchObject({ type: "pi-sdk", model: "anthropic/claude" });
    expect(
      Option.getOrUndefined(Schema.decodeUnknownOption(PiSDKConfigSchema)({ type: "other" })),
    ).toBeUndefined();
  });
});
