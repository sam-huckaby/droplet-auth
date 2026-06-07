import { createAuthRedirect, handleAuthCallback, verifyAppSession } from "../../../src/client/worker";

interface Env {
  AUTH_ORIGIN: string;
  AUTH_SERVICE: Fetcher;
  APP_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/__debug") {
      return Response.json({ appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN, hasAuthService: Boolean(env.AUTH_SERVICE), requestUrl: request.url });
    }

    const callback = await handleAuthCallback(request, { appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN, authService: env.AUTH_SERVICE, debug: true });
    if (callback) return callback;

    const session = await verifyAppSession(request, { appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN, authService: env.AUTH_SERVICE });
    if (!session) return createAuthRedirect(request, { appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN });

    return new Response(`Hello ${session.email}`);
  },
};
