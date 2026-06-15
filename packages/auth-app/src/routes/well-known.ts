import { publicJwksFromPrivateSecret } from "../crypto/signing";
import { id } from "../crypto/random";
import type { Env } from "../types";
import { getState, requestMeta } from "./helpers";

export async function handleJwks(request: Request, env: Env): Promise<Response> {
  const jwks = await publicJwksFromPrivateSecret(env.AUTH_PRIVATE_KEY);
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "public_key_served", ...requestMeta(request) });
  return Response.json(jwks, { headers: { "cache-control": "public, max-age=3600" } });
}
