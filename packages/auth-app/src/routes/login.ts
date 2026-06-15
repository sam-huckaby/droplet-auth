import { generateAuthenticationOptions, verifyAuthenticationResponse, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { sha256Base64Url } from "../crypto/hashing";
import { id, secureRandomBase64Url } from "../crypto/random";
import { loginPage } from "../html/login";
import type { AppConfig, Env } from "../types";
import { validateReturnTo } from "../env";
import { credentialForVerification, rpId } from "../webauthn/options";
import { getState, json, readJson, requestMeta } from "./helpers";

export async function handleLoginPage(request: Request, config: AppConfig): Promise<Response> {
  const url = new URL(request.url);
  const appId = url.searchParams.get("app") ?? "";
  const returnTo = url.searchParams.get("returnTo") ?? "";
  validateReturnTo(config.allowedApps, appId, returnTo);
  return loginPage(appId, returnTo);
}

export async function handleLoginApi(request: Request, env: Env, config: AppConfig, pathname: string): Promise<Response> {
  if (request.method === "POST" && pathname === "/api/login/options") return loginOptions(request, env, config);
  if (request.method === "POST" && pathname === "/api/login/verify") return loginVerify(request, env, config);
  return new Response("Not found", { status: 404 });
}

async function loginOptions(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const body = await readJson<{ appId: string; returnTo: string }>(request);
  const returnTo = validateReturnTo(config.allowedApps, body.appId, body.returnTo);
  const options = await generateAuthenticationOptions({ rpID: rpId(config), userVerification: "preferred" });
  const challengeId = id("chal");
  await getState(env).createChallenge({ id: challengeId, challenge: options.challenge, type: "authentication", context: { appId: body.appId, returnTo: returnTo.toString() }, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
  return json({ ok: true, challengeId, options });
}

async function loginVerify(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const body = await readJson<{ challengeId: string; response: AuthenticationResponseJSON }>(request);
  const challenge = await getState(env).consumeChallenge(body.challengeId, "authentication");
  if (!challenge) return json({ ok: false, error: "Unable to verify passkey" }, { status: 400 });
  const context = challenge.context as { appId: string; returnTo: string };
  validateReturnTo(config.allowedApps, context.appId, context.returnTo);
  const passkey = await getState(env).getPasskeyByCredentialId(body.response.id);
  if (!passkey || passkey.revokedAt) {
    await getState(env).addAuditEvent({ id: id("audit"), eventType: "app_login_failed", appId: context.appId, ...requestMeta(request) });
    return json({ ok: false, error: "Unable to verify passkey" }, { status: 403 });
  }
  const verification = await verifyAuthenticationResponse({ response: body.response, expectedChallenge: challenge.challenge, expectedOrigin: config.authOrigin.origin, expectedRPID: rpId(config), credential: credentialForVerification(passkey), requireUserVerification: false });
  if (!verification.verified) return json({ ok: false, error: "Unable to verify passkey" }, { status: 403 });
  if (!canPasskeyAccessApp(passkey, context.appId)) {
    await getState(env).addAuditEvent({ id: id("audit"), eventType: "app_login_failed", appId: context.appId, passkeyId: passkey.id, email: passkey.email, metadata: { reason: "app_scope_mismatch" }, ...requestMeta(request) });
    return json({ ok: false, error: "Unable to verify passkey" }, { status: 403 });
  }
  await getState(env).markPasskeyUsed(passkey.id, verification.authenticationInfo.newCounter);
  const rawCode = secureRandomBase64Url(32);
  await getState(env).createAuthCode({ id: id("code"), codeHash: await sha256Base64Url(rawCode), appId: context.appId, passkeyId: passkey.id, email: passkey.email, returnTo: context.returnTo, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "app_login_success", appId: context.appId, passkeyId: passkey.id, email: passkey.email, ...requestMeta(request) });
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "auth_code_created", appId: context.appId, passkeyId: passkey.id, email: passkey.email, ...requestMeta(request) });
  const redirectTo = new URL(context.returnTo);
  redirectTo.searchParams.set("code", rawCode);
  return json({ ok: true, redirectTo: redirectTo.toString() });
}

export function canPasskeyAccessApp(passkey: { isAdmin: boolean; appId: string | null }, appId: string): boolean {
  return passkey.isAdmin || passkey.appId === appId;
}
