import { describe, expect, test } from "bun:test";
import { Option, Schema } from "effect";
import { parsePaginatedArray } from "./cli-pagination";

const ItemSchema = Schema.Struct({ id: Schema.Number });
const decodeItem = <Input>(value: Input) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(ItemSchema)(value));

describe("parsePaginatedArray", () => {
  test("merges adjacent pages in order", () => {
    expect(parsePaginatedArray('[{"id":1}][{"id":2}]', decodeItem)).toEqual({
      items: [{ id: 1 }, { id: 2 }],
      rejected: 0,
    });
  });

  test("filters malformed siblings while preserving valid entries", () => {
    expect(parsePaginatedArray('[{"id":1},{"id":"bad"},{"id":1}]', decodeItem)).toEqual({
      items: [{ id: 1 }, { id: 1 }],
      rejected: 1,
    });
  });

  test("preserves duplicate entries and empty output", () => {
    expect(parsePaginatedArray('[{"id":2},{"id":2}]', decodeItem)).toEqual({
      items: [{ id: 2 }, { id: 2 }],
      rejected: 0,
    });
    expect(parsePaginatedArray("", decodeItem)).toEqual({ items: [], rejected: 0 });
  });

  test("throws for invalid JSON and non-array roots", () => {
    expect(() => parsePaginatedArray("not json", decodeItem)).toThrow();
    expect(() => parsePaginatedArray('{"id":1}', decodeItem)).toThrow();
  });
});
