import { Option, Result, Schema } from 'effect';

const PfmReminderSchema = Schema.Struct({
  enabled: Schema.Boolean,
});

const ImprovementHookSchema = Schema.Struct({
  present: Schema.Boolean,
  filePath: Schema.NullOr(Schema.String),
  fileSize: Schema.NullOr(Schema.Number),
  content: Schema.NullOr(Schema.String),
});

const HooksStatusResponseSchema = Schema.Struct({
  pfmReminder: PfmReminderSchema,
  improvementHook: ImprovementHookSchema,
  composedLength: Schema.NullOr(Schema.Number),
});

const HooksStatusEnvelopeSchema = Schema.Struct({
  pfmReminder: Schema.optionalKey(Schema.Unknown),
  improvementHook: Schema.optionalKey(Schema.Unknown),
  composedLength: Schema.optionalKey(Schema.Unknown),
});

const decodeHooksStatusEnvelope = Schema.decodeUnknownResult(HooksStatusEnvelopeSchema);
const decodePfmReminder = Schema.decodeUnknownOption(PfmReminderSchema);
const decodeImprovementHook = Schema.decodeUnknownOption(ImprovementHookSchema);
const decodeComposedLength = Schema.decodeUnknownOption(Schema.NullOr(Schema.Number));

const defaultPfmReminder: Schema.Schema.Type<typeof PfmReminderSchema> = {
  enabled: false,
};

const defaultImprovementHook: Schema.Schema.Type<typeof ImprovementHookSchema> = {
  present: false,
  filePath: null,
  fileSize: null,
  content: null,
};

/** Parsed hooks status with component-safe defaults for malformed optional sections. */
export type HooksStatusResponse = Schema.Schema.Type<typeof HooksStatusResponseSchema>;

/**
 * Decodes the hooks status response while retaining valid optional response sections.
 * An invalid response root remains a failure so the settings UI keeps its loading fallback.
 */
export function decodeHooksStatusResponse<Input>(
  value: Input,
): Result.Result<HooksStatusResponse, Schema.SchemaError> {
  const envelope = decodeHooksStatusEnvelope(value);
  if (Result.isFailure(envelope)) return Result.fail(envelope.failure);

  return Result.succeed({
    pfmReminder: Option.getOrElse(
      decodePfmReminder(envelope.success.pfmReminder),
      () => defaultPfmReminder,
    ),
    improvementHook: Option.getOrElse(
      decodeImprovementHook(envelope.success.improvementHook),
      () => defaultImprovementHook,
    ),
    composedLength: Option.getOrElse(
      decodeComposedLength(envelope.success.composedLength),
      () => null,
    ),
  });
}
