import { Result, Schema } from "effect";

const OpenInAppSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  kind: Schema.Literals(["file-manager", "editor", "terminal"]),
  icon: Schema.String,
});

const OpenInAppsResponseSchema = Schema.Struct({
  available: Schema.Boolean,
  apps: Schema.Array(Schema.Unknown),
});

/** The validated app entry returned by GET /api/open-in/apps. */
export type OpenInAppResponse = Schema.Schema.Type<typeof OpenInAppSchema>;

/** The validated response returned by GET /api/open-in/apps. */
export type OpenInAppsResponse = {
  available: boolean;
  apps: OpenInAppResponse[];
};

const decodeOpenInAppsResponseRoot = Schema.decodeUnknownResult(OpenInAppsResponseSchema);
const decodeOpenInApp = Schema.decodeUnknownResult(OpenInAppSchema);

type OpenInAppsFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Decodes the open-in response root and filters malformed app siblings in order.
 * A malformed root remains a failure so callers can use the unavailable fallback.
 */
export function decodeOpenInAppsResponse<Input>(
  value: Input,
): Result.Result<OpenInAppsResponse, Schema.SchemaError> {
  const root = decodeOpenInAppsResponseRoot(value);
  if (Result.isFailure(root)) return Result.fail(root.failure);

  const apps: OpenInAppResponse[] = [];
  for (const app of root.success.apps) {
    const decodedApp = decodeOpenInApp(app);
    if (Result.isSuccess(decodedApp)) apps.push(decodedApp.success);
  }

  return Result.succeed({
    available: root.success.available,
    apps,
  });
}

function unavailableOpenInAppsResponse(): OpenInAppsResponse {
  return { available: false, apps: [] };
}

/**
 * Creates a memoized open-in app loader. Failed requests and malformed responses
 * clear the cached promise so the next call retries; valid unavailable responses
 * are cached like any other successful response.
 */
export function createOpenInAppsLoader(
  fetcher: OpenInAppsFetcher,
): () => Promise<OpenInAppsResponse> {
  let openInAppsPromise: Promise<OpenInAppsResponse> | null = null;

  return () => {
    if (!openInAppsPromise) {
      openInAppsPromise = fetcher("/api/open-in/apps")
        .then((response) => {
          if (!response.ok) throw new Error(`Open-in apps request failed: ${response.status}`);
          return response.json();
        })
        .then((data) => {
          const decoded = decodeOpenInAppsResponse(data);
          if (Result.isFailure(decoded)) throw new Error("Malformed open-in apps response");
          return decoded.success;
        })
        .catch(() => {
          openInAppsPromise = null;
          return unavailableOpenInAppsResponse();
        });
    }

    return openInAppsPromise;
  };
}

/** Loads and validates the app catalog for the browser UI. */
export const loadOpenInApps = createOpenInAppsLoader((input, init) =>
  globalThis.fetch(input, init),
);
