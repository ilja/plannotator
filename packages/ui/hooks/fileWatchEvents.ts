import { Option, Schema } from "effect";

const FileWatchEventSchema = Schema.Struct({
  type: Schema.Literals(["ready", "changed"]),
  dirPath: Schema.optionalKey(Schema.Unknown),
});

const decodeEvent = Schema.decodeUnknownOption(FileWatchEventSchema);

const decodeString = Schema.decodeUnknownOption(Schema.String);

export interface FileWatchEvent {
  type: "ready" | "changed";
  dirPath: string | null;
}

export function decodeFileWatchEvent<Input>(value: Input): FileWatchEvent | null {
  const event = Option.getOrNull(decodeEvent(value));

  if (!event) return null;

  return {
    type: event.type,
    dirPath: Option.getOrNull(decodeString(event.dirPath)),
  };
}
