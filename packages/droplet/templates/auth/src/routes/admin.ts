import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { sha256Base64Url, timingSafeEqual } from "../crypto/hashing";
import { id, secureRandomBase64Url } from "../crypto/random";
import { adminDashboard, adminLoginPage, bootstrapAdminPage, logoutResponse } from "../html/admin";
import type { AppConfig, Env } from "../types";
import { credentialForVerification, rpId } from "../webauthn/options";
import { createRawSession, getAdminSession, getBootstrapSession, getState, json, readForm, readJson, redirect, requestMeta, sessionCookie } from "./helpers";

const AUDIT_PAGE_SIZES = [50, 100, 500] as const;

export async function handleAdminPage(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const admin = await getAdminSession(request, env);
  if (admin) {
    const state = getState(env);
    const auditPage = parseAuditPagination(new URL(request.url).searchParams);
    const [passkeys, auditTotal, passkeyUsage, appUsage] = await Promise.all([
      state.listPasskeys(),
      state.countAuditEvents(),
      state.listPasskeyUsage(),
      state.listAppUsage(),
    ]);
    const clampedAuditPage = clampAuditPage(auditPage, auditTotal);
    const audit = await state.listAuditEvents(clampedAuditPage.pageSize, clampedAuditPage.offset);
    return adminDashboard(passkeys, audit, { passkeys: passkeyUsage, apps: appUsage }, allowedAppIds(config), { ...clampedAuditPage, total: auditTotal });
  }
  const bootstrap = await getBootstrapSession(request, env);
  if (bootstrap) return bootstrapAdminPage();
  return adminLoginPage(config.allowBootstrapPassword);
}

export async function handleAdminApi(request: Request, env: Env, config: AppConfig, pathname: string): Promise<Response> {
  if (!isSameOriginAdminMutation(request, config)) return new Response("Forbidden", { status: 403 });
  if (request.method === "POST" && pathname === "/api/admin/bootstrap-login") return bootstrapLogin(request, env, config);
  if (request.method === "POST" && pathname === "/api/admin/bootstrap-enrollment-link") return bootstrapEnrollment(request, env, config);
  if (request.method === "POST" && pathname === "/api/admin/passkey/options") return adminPasskeyOptions(env, config);
  if (request.method === "POST" && pathname === "/api/admin/passkey/verify") return adminPasskeyVerify(request, env, config);
  if (request.method === "POST" && pathname === "/api/admin/logout") return logoutResponse();
  if (request.method === "POST" && pathname === "/api/admin/enrollment-links") return createEnrollmentFromAdmin(request, env, config);
  if (request.method === "GET" && pathname === "/api/admin/passkeys") return requireAdminJson(request, env, async () => json({ ok: true, passkeys: await getState(env).listPasskeys() }));
  if (request.method === "GET" && pathname === "/api/admin/audit") return adminAuditJson(request, env);
  const patch = pathname.match(/^\/api\/admin\/passkeys\/([^/]+)$/);
  if (request.method === "PATCH" && patch) return updatePasskey(request, env, patch[1]);
  const revoke = pathname.match(/^\/api\/admin\/passkeys\/([^/]+)\/revoke$/);
  if (request.method === "POST" && revoke) return revokePasskey(request, env, revoke[1]);
  return new Response("Not found", { status: 404 });
}

async function bootstrapLogin(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const state = getState(env);
  const form = await readForm(request);
  const meta = requestMeta(request);
  const recentFailures = await state.countRecentAuditEvents({
    eventType: "bootstrap_login_failed",
    ip: meta.ip,
    since: new Date(Date.now() - 15 * 60_000).toISOString(),
  });
  if (recentFailures >= 10) {
    await state.addAuditEvent({ id: id("audit"), eventType: "bootstrap_login_failed", metadata: { reason: "rate_limited" }, ...meta });
    return new Response("Too many bootstrap login attempts", { status: 429 });
  }
  const ok = config.allowBootstrapPassword && (await timingSafeEqual(form.password ?? "", env.BOOTSTRAP_PW));
  await state.addAuditEvent({ id: id("audit"), eventType: ok ? "bootstrap_login_success" : "bootstrap_login_failed", ...meta });
  if (!ok) return new Response("Bootstrap password login is disabled or invalid", { status: 403 });
  const { raw, session } = await createRawSession(state, { type: "bootstrap_admin", ttlSeconds: 15 * 60 });
  return redirect("/admin", new Headers({ "set-cookie": sessionCookie("bootstrap_admin", raw, session.expiresAt) }));
}

async function bootstrapEnrollment(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const bootstrap = await getBootstrapSession(request, env);
  if (!bootstrap) return new Response("Forbidden", { status: 403 });
  const link = await createEnrollmentLink(env, config, { createsAdminPasskey: true, createdViaBootstrap: true });
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "enrollment_link_created", metadata: { bootstrap: true }, ...requestMeta(request) });
  return redirect(link);
}

async function createEnrollmentFromAdmin(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const admin = await getAdminSession(request, env);
  if (!admin) return new Response("Forbidden", { status: 403 });
  const form = await readForm(request);
  const createsAdminPasskey = form.createsAdminPasskey === "true";
  const appId = createsAdminPasskey ? undefined : allowedAppId(form.appId, config);
  if (!createsAdminPasskey && !appId) return new Response("A valid app is required for non-admin enrollment links", { status: 400 });
  const link = await createEnrollmentLink(env, config, {
    defaultEmail: form.defaultEmail || undefined,
    defaultLabel: form.defaultLabel || undefined,
    createsAdminPasskey,
    appId,
    createdByPasskeyId: admin.passkeyId ?? undefined,
    createdViaBootstrap: false,
  });
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "enrollment_link_created", passkeyId: admin.passkeyId ?? undefined, metadata: { createsAdminPasskey, appId: appId ?? null }, ...requestMeta(request) });
  const [passkeys, audit, passkeyUsage, appUsage] = await Promise.all([getState(env).listPasskeys(), getState(env).listAuditEvents(50), getState(env).listPasskeyUsage(), getState(env).listAppUsage()]);
  const auditTotal = await getState(env).countAuditEvents();
  return adminDashboard(passkeys, audit, { passkeys: passkeyUsage, apps: appUsage }, allowedAppIds(config), { page: 1, pageSize: 50, total: auditTotal }, link);
}

async function adminAuditJson(request: Request, env: Env): Promise<Response> {
  return requireAdminJson(request, env, async () => {
    const auditPage = parseAuditPagination(new URL(request.url).searchParams);
    const total = await getState(env).countAuditEvents();
    const clampedAuditPage = clampAuditPage(auditPage, total);
    const audit = await getState(env).listAuditEvents(clampedAuditPage.pageSize, clampedAuditPage.offset);
    return json({ ok: true, audit, page: clampedAuditPage.page, pageSize: clampedAuditPage.pageSize, total });
  });
}

async function createEnrollmentLink(
  env: Env,
  config: AppConfig,
  input: { defaultEmail?: string; defaultLabel?: string; createsAdminPasskey: boolean; appId?: string; createdByPasskeyId?: string; createdViaBootstrap: boolean },
): Promise<string> {
  const raw = secureRandomBase64Url(32);
  await getState(env).createEnrollmentLink({ id: id("enroll"), tokenHash: await sha256Base64Url(raw), ...input });
  return `${config.authOrigin.origin}/enroll?k=${encodeURIComponent(raw)}`;
}

function allowedAppId(value: string | undefined, config: AppConfig): string | undefined {
  const appId = value?.trim();
  if (!appId || !config.allowedApps[appId]) return undefined;
  return appId;
}

function allowedAppIds(config: AppConfig): string[] {
  return Object.keys(config.allowedApps).sort();
}

export function parseAuditPagination(searchParams: URLSearchParams): { page: number; pageSize: 50 | 100 | 500; offset: number } {
  const rawPageSize = Number(searchParams.get("auditPageSize") ?? "50");
  const pageSize = AUDIT_PAGE_SIZES.includes(rawPageSize as 50 | 100 | 500) ? (rawPageSize as 50 | 100 | 500) : 50;
  const rawPage = Number(searchParams.get("auditPage") ?? "1");
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function clampAuditPage(input: { page: number; pageSize: 50 | 100 | 500 }, total: number): { page: number; pageSize: 50 | 100 | 500; offset: number } {
  const totalPages = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(input.page, totalPages);
  return { page, pageSize: input.pageSize, offset: (page - 1) * input.pageSize };
}

async function adminPasskeyOptions(env: Env, config: AppConfig): Promise<Response> {
  const options = await generateAuthenticationOptions({ rpID: rpId(config), userVerification: "preferred" });
  const challengeId = id("chal");
  await getState(env).createChallenge({ id: challengeId, challenge: options.challenge, type: "admin_authentication", context: {}, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
  return json({ ok: true, challengeId, options });
}

async function adminPasskeyVerify(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const body = await readJson<{ challengeId: string; response: AuthenticationResponseJSON }>(request);
  const challenge = await getState(env).consumeChallenge(body.challengeId, "admin_authentication");
  if (!challenge) return json({ ok: false, error: "Unable to verify passkey" }, { status: 400 });
  const passkey = await getState(env).getPasskeyByCredentialId(body.response.id);
  if (!passkey || passkey.revokedAt || !passkey.isAdmin) {
    await getState(env).addAuditEvent({ id: id("audit"), eventType: "admin_passkey_login_failed", ...requestMeta(request) });
    return json({ ok: false, error: "Unable to verify passkey" }, { status: 403 });
  }
  const verification = await verifyAuthenticationResponse({ response: body.response, expectedChallenge: challenge.challenge, expectedOrigin: config.authOrigin.origin, expectedRPID: rpId(config), credential: credentialForVerification(passkey), requireUserVerification: false });
  if (!verification.verified) return json({ ok: false, error: "Unable to verify passkey" }, { status: 403 });
  await getState(env).markPasskeyUsed(passkey.id, verification.authenticationInfo.newCounter);
  const { raw, session } = await createRawSession(getState(env), { type: "admin", passkeyId: passkey.id, email: passkey.email, ttlSeconds: 60 * 60 });
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "admin_passkey_login_success", passkeyId: passkey.id, email: passkey.email, ...requestMeta(request) });
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie("admin", raw, session.expiresAt) } });
}

async function revokePasskey(request: Request, env: Env, passkeyId: string): Promise<Response> {
  const admin = await getAdminSession(request, env);
  if (!admin) return new Response("Forbidden", { status: 403 });
  await getState(env).revokePasskey(decodeURIComponent(passkeyId));
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "passkey_revoked", passkeyId: decodeURIComponent(passkeyId), metadata: { by: admin.passkeyId }, ...requestMeta(request) });
  return redirect("/admin");
}

async function updatePasskey(request: Request, env: Env, passkeyId: string): Promise<Response> {
  const admin = await getAdminSession(request, env);
  if (!admin) return json({ ok: false, error: "Forbidden" }, { status: 403 });
  const body = await readJson<{ email?: string; label?: string }>(request);
  const passkey = await getState(env).updatePasskey(decodeURIComponent(passkeyId), { email: body.email, label: body.label });
  if (!passkey) return json({ ok: false, error: "Not found" }, { status: 404 });
  await getState(env).addAuditEvent({ id: id("audit"), eventType: "passkey_updated", passkeyId: passkey.id, metadata: { by: admin.passkeyId }, ...requestMeta(request) });
  return json({ ok: true, passkey });
}

async function requireAdminJson(request: Request, env: Env, fn: () => Promise<Response>): Promise<Response> {
  if (!(await getAdminSession(request, env))) return json({ ok: false, error: "Forbidden" }, { status: 403 });
  return fn();
}

function isSameOriginAdminMutation(request: Request, config: AppConfig): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return true;
  const origin = request.headers.get("origin");
  return origin === config.authOrigin.origin;
}
