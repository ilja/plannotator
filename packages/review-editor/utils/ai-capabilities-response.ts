import { Option, Schema } from "effect";
import {
  isPiProvider,
  type AIProviderModel,
  type AIProviderOption,
} from "@plannotator/ui/utils/aiProvider";

const AIProviderCapabilitiesSchema = Schema.Struct({
  fork: Schema.Boolean,
  resume: Schema.Boolean,
  streaming: Schema.Boolean,
  tools: Schema.Boolean,
});

const AIModelFieldsSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  default: Schema.optionalKey(Schema.Boolean),
});

const AIProviderFieldsSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  capabilities: AIProviderCapabilitiesSchema,
  models: Schema.Array(Schema.Unknown),
});

const AICapabilitiesRootSchema = Schema.Struct({
  available: Schema.Boolean,
  providers: Schema.Array(Schema.Unknown),
  defaultProvider: Schema.optionalKey(Schema.Unknown),
});

type AIProviderCapabilities = Schema.Schema.Type<typeof AIProviderCapabilitiesSchema>;

type UnknownValue = Schema.Schema.Type<typeof Schema.Unknown>;

/** A validated provider entry from the review server's AI capabilities response. */
export interface ReviewAICapabilitiesProvider extends AIProviderOption {
  capabilities: AIProviderCapabilities;
  models: AIProviderModel[];
}

/** The AI state the review editor applies after validating its capabilities response. */
export interface ReviewAICapabilitiesState {
  available: boolean;
  providers: ReviewAICapabilitiesProvider[];
  defaultProvider: string | null;
}

const decodeRoot = Schema.decodeUnknownOption(AICapabilitiesRootSchema);

const decodeProviderFields = Schema.decodeUnknownOption(AIProviderFieldsSchema);

const decodeModelFields = Schema.decodeUnknownOption(AIModelFieldsSchema);

const decodeDefaultProvider = Schema.decodeUnknownOption(Schema.NullOr(Schema.String));

function decodeProvider(value: UnknownValue): ReviewAICapabilitiesProvider | undefined {
  const fields = Option.getOrUndefined(decodeProviderFields(value));

  if (!fields) return undefined;

  const models = fields.models.flatMap((model) => {
    const decoded = Option.getOrUndefined(decodeModelFields(model));

    return decoded ? [decoded] : [];
  });

  return {
    id: fields.id,
    name: fields.name,
    capabilities: fields.capabilities,
    models,
  };
}

/** Decode the unknown value returned by the review server's AI capabilities endpoint. */
export function decodeReviewAICapabilitiesResponse(
  value: UnknownValue,
): ReviewAICapabilitiesState | undefined {
  const root = Option.getOrUndefined(decodeRoot(value));

  if (!root) return undefined;

  const providers = root.providers.flatMap((provider) => {
    const decoded = decodeProvider(provider);

    return decoded ? [decoded] : [];
  });

  const defaultProvider = Option.getOrNull(decodeDefaultProvider(root.defaultProvider));

  return { available: root.available, providers, defaultProvider };
}

/** Load and validate review AI capabilities, returning undefined when no state update is safe. */
export async function loadReviewAICapabilitiesState(
  response: Response,
): Promise<ReviewAICapabilitiesState | undefined> {
  if (!response.ok) return undefined;

  try {
    const decoded = decodeReviewAICapabilitiesResponse(await response.json());

    if (!decoded) return undefined;

    if (!decoded.available) {
      return { available: false, providers: [], defaultProvider: null };
    }

    const providers = decoded.providers.filter(isPiProvider);

    const defaultProvider =
      decoded.defaultProvider !== null &&
      providers.some((provider) => provider.id === decoded.defaultProvider)
        ? decoded.defaultProvider
        : null;

    return {
      available: providers.length > 0,
      providers,
      defaultProvider,
    };
  } catch {
    return undefined;
  }
}
