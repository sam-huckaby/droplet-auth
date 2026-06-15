import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { bytesToBase64Url } from "../crypto/base64url";
import { sha256Base64Url } from "../crypto/hashing";
import { id } from "../crypto/random";
import { enrollmentErrorPage, enrollmentPage, enrollmentSuccessPage } from "../html/enroll";
import type { AppConfig, Env } from "../types";
import { registrationOptions, rpId } from "../webauthn/options";
import { getState, json, readJson, requestMeta } from "./helpers";

export async function handleEnrollPage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/enroll/success") return enrollmentSuccessPage();
  const token = url.searchParams.get("k");
  if (!token) return enrollmentErrorPage();
  const link = await getState(env).getUsableEnrollmentLink(await sha256Base64Url(token));
  if (!link) return enrollmentErrorPage();
  return enrollmentPage(token, link);
}

export async function handleEnrollApi(request: Request, env: Env, config: AppConfig, pathname: string): Promise<Response> {
  if (request.method === "POST" && pathname === "/api/enroll/options") return enrollOptions(request, env, config);
  if (request.method === "POST" && pathname === "/api/enroll/verify") return enrollVerify(request, env, config);
  return new Response("Not found", { status: 404 });
}

async function enrollOptions(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const body = await readJson<{ token: string; email: string; label: string }>(request);
  const tokenHash = await sha256Base64Url(body.token ?? "");
  const link = await getState(env).getUsableEnrollmentLink(tokenHash);
  if (!link) return json({ ok: false, error: "Invalid or expired enrollment link" }, { status: 400 });
  const email = (body.email || link.defaultEmail || "").trim();
  const label = (body.label || link.defaultLabel || email).trim();
  if (!email || !label) return json({ ok: false, error: "Email and label are required" }, { status: 400 });
  const options = await registrationOptions(config, { email, label });
  const challengeId = id("chal");
  await getState(env).createChallenge({ id: challengeId, challenge: options.challenge, type: "registration", context: { tokenHash, linkId: link.id, email, label, appId: link.appId }, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
  return json({ ok: true, challengeId, options });
}

async function enrollVerify(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const body = await readJson<{ challengeId: string; response: RegistrationResponseJSON }>(request);
  const challenge = await getState(env).consumeChallenge(body.challengeId, "registration");
  if (!challenge) return json({ ok: false, error: "Unable to verify passkey" }, { status: 400 });
  const context = challenge.context as { tokenHash: string; linkId: string; email: string; label: string; appId: string | null };
  const link = await getState(env).getUsableEnrollmentLink(context.tokenHash);
  if (!link || link.id !== context.linkId) return json({ ok: false, error: "Invalid or expired enrollment link" }, { status: 400 });
  const verification = await verifyRegistrationResponse({ response: body.response, expectedChallenge: challenge.challenge, expectedOrigin: config.authOrigin.origin, expectedRPID: rpId(config), requireUserVerification: false });
  if (!verification.verified) return json({ ok: false, error: "Unable to verify passkey" }, { status: 403 });
  const passkey = await getState(env).createPasskey({
    id: id("pk"),
    credentialId: verification.registrationInfo.credential.id,
    publicKey: bytesToBase64Url(verification.registrationInfo.credential.publicKey),
    counter: verification.registrationInfo.credential.counter,
    email: context.email,
    label: context.label,
    isAdmin: link.createsAdminPasskey,
    appId: link.createsAdminPasskey ? undefined : (context.appId ?? undefined),
  });
  await getState(env).consumeEnrollmentLink(link.id, passkey.id);
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "passkey_registered", passkeyId: passkey.id, email: passkey.email, metadata: { isAdmin: passkey.isAdmin, appId: passkey.appId }, ...requestMeta(request) });
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "enrollment_link_consumed", passkeyId: passkey.id, email: passkey.email, ...requestMeta(request) });
  return json({ ok: true, passkeyId: passkey.id });
}
