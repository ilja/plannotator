import { Option, Schema } from "effect";

export interface ConventionalLabelEntryFields {
  readonly label?: unknown;
  readonly display?: unknown;
  readonly blocking?: unknown;
}

export interface StrictConventionalLabelEntry {
  readonly label: string;
  readonly display: string;
  readonly blocking: boolean;
}

const JsonLabelArraySchema = Schema.fromJsonString(Schema.Array(Schema.Unknown));
const LabelRecordSchema = Schema.Record(Schema.String, Schema.Unknown);
const StrictLabelArraySchema = Schema.NullOr(
  Schema.Array(
    Schema.Struct({
      label: Schema.String,
      display: Schema.String,
      blocking: Schema.Boolean,
    }),
  ),
);
const StrictLabelJsonSchema = Schema.fromJsonString(StrictLabelArraySchema);
const decodeJsonLabelArray = Schema.decodeUnknownOption(JsonLabelArraySchema);
const decodeLabelRecord = Schema.decodeUnknownOption(LabelRecordSchema);
const decodeString = Schema.decodeUnknownOption(Schema.String);
const decodeStrictLabelArray = Schema.decodeUnknownOption(StrictLabelArraySchema);
const decodeStrictLabelJson = Schema.decodeUnknownOption(StrictLabelJsonSchema);

/** Decode the cookie JSON container without choosing a caller fallback. */
export function decodeConventionalLabelJsonArray(
  json: string | null,
): readonly unknown[] | undefined {
  if (!json) return undefined;
  return Option.getOrUndefined(decodeJsonLabelArray(json));
}

/** Decode one JSON object into independently inspectable label fields. */
export function decodeConventionalLabelEntryFields(
  value: any,
): ConventionalLabelEntryFields | undefined {
  const record = Option.getOrUndefined(decodeLabelRecord(value));
  if (!record) return undefined;
  return {
    ...(Object.prototype.hasOwnProperty.call(record, "label") && { label: record.label }),
    ...(Object.prototype.hasOwnProperty.call(record, "display") && { display: record.display }),
    ...(Object.prototype.hasOwnProperty.call(record, "blocking") && { blocking: record.blocking }),
  };
}

export function decodeConventionalLabelString(value: any): string | undefined {
  return Option.getOrUndefined(decodeString(value));
}

/** Strict atomic decoder used for server config synchronization. */
export function decodeStrictConventionalLabels(
  value: any,
): StrictConventionalLabelEntry[] | null | undefined {
  const decoded = Option.getOrUndefined(decodeStrictLabelArray(value));
  if (decoded === null) return null;
  if (decoded === undefined) return undefined;

  const labels: StrictConventionalLabelEntry[] = [];
  for (const { label, display, blocking } of decoded) {
    labels.push({ label, display, blocking });
  }
  return labels;
}

/** Strict atomic decoder for the JSON string used by the cookie setting. */
export function decodeStrictConventionalLabelsJson(
  json: string,
): StrictConventionalLabelEntry[] | null | undefined {
  const decoded = Option.getOrUndefined(decodeStrictLabelJson(json));
  if (decoded === null) return null;
  if (decoded === undefined) return undefined;

  const labels: StrictConventionalLabelEntry[] = [];
  for (const { label, display, blocking } of decoded) {
    labels.push({ label, display, blocking });
  }
  return labels;
}
