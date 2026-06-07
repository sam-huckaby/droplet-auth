import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";

export interface DropletAuthSession extends JWTPayload {
  sub: string;
  email: string;
  isAdmin: boolean;
}

export interface DropletAuthWorkerOptions {
  appId: string;
  authOrigin: string;
  authService?: Fetcher;
  cookieName?: string;
  debug?: boolean;
}

export function createAuthRedirect(request: Request, options: { appId: string; authOrigin: string; returnTo?: string }): Response {
  const returnTo = options.returnTo ?? request.url;
  const url = new URL("/login", options.authOrigin);
  url.searchParams.set("app", options.appId);
  url.searchParams.set("returnTo", returnTo);
  return Response.redirect(url.toString(), 302);
}

export async function handleAuthCallback(request: Request, options: DropletAuthWorkerOptions): Promise<Response | null> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return null;
  const exchangeRequest = new Request(new URL("/api/token/exchange", options.authOrigin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, appId: options.appId }),
  });
  const response = await fetchWithOptionalService(options, exchangeRequest);
  if (!response.ok) {
    const body = await response.text();
    if (options.debug) {
      return Response.json(
        {
          ok: false,
          error: "Unable to exchange auth code",
          exchangeStatus: response.status,
          exchangeBody: parseMaybeJson(body),
          appId: options.appId,
          authOrigin: options.authOrigin,
          requestUrl: request.url,
        },
        { status: 502 },
      );
    }
    return new Response("Unable to exchange auth code", { status: 401 });
  }
  const body = (await response.json()) as { session: string; expiresAt: string };
  url.searchParams.delete("code");
  return new Response(null, {
    status: 303,
    headers: {
      location: url.toString(),
      "set-cookie": `${options.cookieName ?? "da_session"}=${encodeURIComponent(body.session)}; Expires=${new Date(body.expiresAt).toUTCString()}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

export async function verifyAppSession(request: Request, options: DropletAuthWorkerOptions): Promise<DropletAuthSession | null> {
  const token = getCookie(request, options.cookieName ?? "da_session");
  if (!token) return null;
  try {
    const jwks = await fetchAuthPublicKey(options.authOrigin, options.authService);
    const result = await jwtVerify(token, createLocalJWKSet(jwks), { issuer: options.authOrigin, audience: options.appId });
    return result.payload as DropletAuthSession;
  } catch {
    return null;
  }
}

export async function requireLogin(request: Request, options: DropletAuthWorkerOptions): Promise<DropletAuthSession | Response> {
  const callback = await handleAuthCallback(request, options);
  if (callback) return callback;
  const session = await verifyAppSession(request, options);
  return session ?? createAuthRedirect(request, options);
}

function parseMaybeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export async function fetchAuthPublicKey(authOrigin: string, authService?: Fetcher): Promise<JSONWebKeySet> {
  const request = new Request(new URL("/.well-known/droplet-auth/jwks.json", authOrigin));
  const response = await fetchWithOptionalService({ authService }, request);
  if (!response.ok) throw new Error(`Unable to fetch auth public key: ${response.status}`);
  return response.json() as Promise<JSONWebKeySet>;
}

async function fetchWithOptionalService(options: Pick<DropletAuthWorkerOptions, "authService">, request: Request): Promise<Response> {
  return options.authService ? options.authService.fetch(request) : fetch(request);
}

function getCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}
