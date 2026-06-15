import { createAuthRedirect, createLogoutResponse, handleAuthCallback, verifyAppSession, type DropletAuthSession } from "@whnvr/droplet/auth/worker";

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
    if (request.method === "POST" && url.pathname === "/logout") {
      return createLogoutResponse();
    }

    const callback = await handleAuthCallback(request, { appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN, authService: env.AUTH_SERVICE, debug: true });
    if (callback) return callback;

    const session = await verifyAppSession(request, { appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN, authService: env.AUTH_SERVICE });
    if (!session) return createAuthRedirect(request, { appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN });

    return signedInPage(session, env.APP_ID);
  },
};

function signedInPage(session: DropletAuthSession, appId: string): Response {
  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Droplet Auth Demo</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #0f172a; color: #e2e8f0; }
    main { width: min(92vw, 480px); padding: 32px; border: 1px solid #334155; border-radius: 24px; background: linear-gradient(145deg, #111827, #1e293b); box-shadow: 0 24px 80px rgb(0 0 0 / 0.35); }
    p { color: #94a3b8; line-height: 1.6; }
    strong { color: #f8fafc; }
    button { border: 0; border-radius: 999px; padding: 12px 18px; background: #38bdf8; color: #082f49; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>Signed in</h1>
    <p>Hello <strong>${escapeHtml(session.email)}</strong>.</p>
    <p>This protected Worker accepted a Droplet Auth session for <strong>${escapeHtml(appId)}</strong>.</p>
    <form method="post" action="/logout">
      <button type="submit">Log out</button>
    </form>
  </main>
</body>
</html>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}
