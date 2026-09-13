/** Schemas whose wire shape differs per runtime; shared ones live in `@plannotator/shared/review-request`. */

import { Schema } from "effect";

/** Code navigation request. */
export const CodeNavRequestSchema = Schema.Struct({
  symbol: Schema.String,
  filePath: Schema.String,
  line: Schema.Number,
  charStart: Schema.Number,
  side: Schema.Literals(["old", "new"]),
  language: Schema.optionalKey(Schema.String),
});
