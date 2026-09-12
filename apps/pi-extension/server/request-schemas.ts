/**
 * Node-only HTTP request-boundary schemas.
 *
 * The shared review request schemas live in `@plannotator/shared/review-request`
 * (consumed here via the `generated/` vendor copy). Only schemas whose wire
 * shape genuinely differs per runtime stay here: Bun's open-in body allows an
 * absent `filePath` while Node's requires one, and code navigation already
 * has its own shared module on the Bun side.
 */

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
