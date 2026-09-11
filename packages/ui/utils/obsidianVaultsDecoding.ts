import { Option, Schema } from "effect";

const ObsidianVaultsResponseSchema = Schema.Struct({
  vaults: Schema.Array(Schema.Unknown),
});

const decodeObsidianVaultsResponseEnvelope = Schema.decodeUnknownOption(
  ObsidianVaultsResponseSchema,
);

const decodeObsidianVaultPath = Schema.decodeUnknownOption(Schema.String);

/**
 * Decodes an Obsidian vault response envelope, retaining valid string siblings in order.
 * The response must contain a `vaults` array; malformed sibling values are omitted.
 */
export function decodeObsidianVaultsResponse<Input>(value: Input): Option.Option<string[]> {
  const envelope = decodeObsidianVaultsResponseEnvelope(value);

  if (Option.isNone(envelope)) return Option.none();

  const vaults: string[] = [];

  for (const value of envelope.value.vaults) {
    const vaultPath = decodeObsidianVaultPath(value);

    if (Option.isSome(vaultPath)) vaults.push(vaultPath.value);
  }

  return Option.some(vaults);
}
