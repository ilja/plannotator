/**
 * Transport-level JSON body parsing for Bun servers.
 *
 * Parsing ("is this JSON?") stays separate from validation ("is this the
 * shape the route wants?"). Every route maps `{ ok: false }` to
 * `400 Malformed JSON body` and decodes `value` with its own schema, so
 * unparseable bytes can never masquerade as a (usually invalid) `{}` or
 * explode into a 500.
 */

export type JsonBody = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

export async function readJsonBody(req: Request): Promise<JsonBody> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false };
  }
}

/** 400 response shared by every route for unparseable request bodies. */
export function malformedJsonBody(): Response {
  return Response.json({ error: "Malformed JSON body" }, { status: 400 });
}
