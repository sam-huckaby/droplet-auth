import type { AuthState } from "../auth-state";
import { ADMIN_SESSION_COOKIE, BOOTSTRAP_SESSION_COOKIE, getCookie, setSessionCookie } from "../crypto/cookies";
import { sha256Base64Url } from "../crypto/hashing";
import { id, secureRandomBase64Url } from "../crypto/random";
import type { Env, SessionRecord } from "../types";

export function getState(env: Env): AuthState {
  return env.AUTH_STATE.getByName("global") as unknown as AuthState;
}

export async function readJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

export async function readForm(request: Request): Promise<Record<string, string>> {
  const form = await request.formData();
  const result: Record<string, string> = {};
  for (const [key, value] of form.entries()) result[key] = typeof value === "string" ? value : "";
  return result;
}

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function redirect(location: string, headers?: Headers): Response {
  return new Response(null, { status: 303, headers: { ...(headers ? Object.fromEntries(headers) : {}), location } });
}

export async function createRawSession(
  state: AuthState,
  input: { type: "admin" | "bootstrap_admin"; passkeyId?: string; email?: string; ttlSeconds: number },
): Promise<{ raw: string; session: SessionRecord }> {
  const raw = secureRandomBase64Url(32);
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
  const session = await state.createSession({
    id: id("sess"),
    sessionHash: await sha256Base64Url(raw),
    type: input.type,
    passkeyId: input.passkeyId,
    email: input.email,
    expiresAt,
  });
  return { raw, session };
}

export async function getAdminSession(request: Request, env: Env): Promise<SessionRecord | null> {
  const raw = getCookie(request, ADMIN_SESSION_COOKIE);
  if (!raw) return null;
  return getState(env).getSessionByHash(await sha256Base64Url(raw), "admin");
}

export async function getBootstrapSession(request: Request, env: Env): Promise<SessionRecord | null> {
  const raw = getCookie(request, BOOTSTRAP_SESSION_COOKIE);
  if (!raw) return null;
  return getState(env).getSessionByHash(await sha256Base64Url(raw), "bootstrap_admin");
}

export function sessionCookie(type: "admin" | "bootstrap_admin", raw: string, expiresAt: string): string {
  return setSessionCookie(type === "admin" ? ADMIN_SESSION_COOKIE : BOOTSTRAP_SESSION_COOKIE, raw, expiresAt);
}

export function requestMeta(request: Request): { ip?: string; userAgent?: string } {
  return {
    ip: request.headers.get("cf-connecting-ip") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}
