import type { AppConfig } from "../env";
import { createAuthRedirect, handleAuthCallback, verifyAppSession, type DropletAuthSession } from "@whnvr/droplet/auth/worker";

export interface AuthContext {
  session: DropletAuthSession | null;
}

export async function authenticate(request: Request, config: AppConfig): Promise<{ type: "pass"; context: AuthContext } | { type: "response"; response: Response }> {
  if (!config.auth.enabled) return { type: "pass", context: { session: null } };
  const options = { appId: config.auth.appId, authOrigin: config.auth.authOrigin, authService: config.auth.authService, debug: true };
  const callback = await handleAuthCallback(request, options);
  if (callback) return { type: "response", response: callback };
  const session = await verifyAppSession(request, options);
  if (session) return { type: "pass", context: { session } };
  if (isApiRequest(request)) {
    return { type: "response", response: Response.json({ ok: false, error: { code: "AUTH_REQUIRED", message: "Authentication is required." } }, { status: 401 }) };
  }
  return { type: "response", response: createAuthRedirect(request, options) };
}

function isApiRequest(request: Request): boolean {
  const url = new URL(request.url);
  const accept = request.headers.get("accept") ?? "";
  return url.pathname.startsWith("/api/") || accept.includes("application/json");
}
