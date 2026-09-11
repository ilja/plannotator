import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";
import {
  decodeExternalAnnotationEventEnvelope,
  decodeExternalAnnotationPollingEnvelope,
  parseExternalAnnotationEvent,
  parseExternalAnnotationPollingSnapshot,
} from "./externalAnnotationDecoding";

const TestAnnotationSchema = Schema.Struct({
  id: Schema.String,
  source: Schema.optionalKey(Schema.String),
});

const decodeTestAnnotation = Schema.decodeUnknownOption(TestAnnotationSchema);

const firstAnnotation = { id: "annotation-1", source: "agent" };

const secondAnnotation = { id: "annotation-2" };

function parseEvent(value: Parameters<typeof decodeExternalAnnotationEventEnvelope>[0]) {
  const envelope = Option.getOrNull(decodeExternalAnnotationEventEnvelope(value));

  return envelope ? parseExternalAnnotationEvent(envelope, decodeTestAnnotation) : null;
}

function parsePollingSnapshot(
  value: Parameters<typeof decodeExternalAnnotationPollingEnvelope>[0],
) {
  const envelope = Option.getOrNull(decodeExternalAnnotationPollingEnvelope(value));

  return envelope ? parseExternalAnnotationPollingSnapshot(envelope, decodeTestAnnotation) : null;
}

describe("parseExternalAnnotationEvent", () => {
  test("decodes snapshots and filters malformed annotation siblings", () => {
    expect(
      parseEvent({
        type: "snapshot",
        annotations: [firstAnnotation, { id: 42 }, secondAnnotation],
      }),
    ).toEqual({
      type: "snapshot",
      annotations: [firstAnnotation, secondAnnotation],
    });
  });

  test("decodes adds and filters malformed annotation siblings", () => {
    expect(
      parseEvent({
        type: "add",
        annotations: [{ id: false }, firstAnnotation],
      }),
    ).toEqual({
      type: "add",
      annotations: [firstAnnotation],
    });
  });

  test("decodes removes and filters malformed ID siblings", () => {
    expect(
      parseEvent({
        type: "remove",
        ids: ["annotation-1", 42, "annotation-2"],
      }),
    ).toEqual({
      type: "remove",
      ids: ["annotation-1", "annotation-2"],
    });
  });

  test("decodes clear events with an optional source", () => {
    expect(parseEvent({ type: "clear" })).toEqual({
      type: "clear",
    });
    expect(parseEvent({ type: "clear", source: "agent" })).toEqual({
      type: "clear",
      source: "agent",
    });
  });

  test("rejects updates with malformed, missing, or mismatched annotations", () => {
    expect(
      parseEvent({
        type: "update",
        id: "annotation-1",
        annotation: firstAnnotation,
      }),
    ).toEqual({
      type: "update",
      id: "annotation-1",
      annotation: firstAnnotation,
    });

    expect(
      parseEvent({
        type: "update",
        id: "annotation-1",
        annotation: { id: 42 },
      }),
    ).toBeNull();
    expect(
      parseEvent({
        type: "update",
        annotation: firstAnnotation,
      }),
    ).toBeNull();
    expect(
      parseEvent({
        type: "update",
        id: "annotation-1",
        annotation: secondAnnotation,
      }),
    ).toBeNull();
  });

  test("rejects unknown types and malformed event fields", () => {
    expect(parseEvent({ type: "replace" })).toBeNull();
    expect(parseEvent({ type: "snapshot" })).toBeNull();
    expect(parseEvent({ type: "snapshot", annotations: {} })).toBeNull();
    expect(parseEvent({ type: "remove", ids: {} })).toBeNull();
    expect(parseEvent({ type: "clear", source: 42 })).toBeNull();
  });
});

describe("parseExternalAnnotationPollingSnapshot", () => {
  test("decodes polling snapshots and filters malformed annotation siblings", () => {
    expect(
      parsePollingSnapshot({
        annotations: [firstAnnotation, { id: 42 }, secondAnnotation],
        version: 3,
      }),
    ).toEqual({
      annotations: [firstAnnotation, secondAnnotation],
      version: 3,
    });
  });

  test("preserves annotations when version metadata is malformed or missing", () => {
    for (const version of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "3", undefined]) {
      expect(
        parsePollingSnapshot({
          annotations: [firstAnnotation],
          version,
        }),
      ).toEqual({ annotations: [firstAnnotation], version: null });
    }
  });

  test("rejects polling envelopes without an annotation array", () => {
    expect(parsePollingSnapshot({ annotations: {}, version: 3 })).toBeNull();
  });
});
