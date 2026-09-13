/**
 * Transport-level JSON body parsing for Bun servers: parsing ("is this
 * JSON?") stays separate from validation ("is this the shape the route
 * wants?"). Unparseable bytes resolve to `{ ok: false }`.
 */

export type JsonBody = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

export async function readJsonBody(req: Request): Promise<JsonBody> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false };
  }
}

export function malformedJsonBody(): Response {
  return Response.json({ error: "Malformed JSON body" }, { status: 400 });
}
