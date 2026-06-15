import { AuthState } from "./auth-state";
import { ConfigError, parseConfig } from "./env";
import { handleAsset } from "./routes/assets";
import { handleAdminApi, handleAdminPage } from "./routes/admin";
import { handleEnrollApi, handleEnrollPage } from "./routes/enroll";
import { handleHealth } from "./routes/health";
import { handleLoginApi, handleLoginPage } from "./routes/login";
import { handleTokenExchange } from "./routes/token";
import { handleJwks } from "./routes/well-known";
import type { Env } from "./types";

export { AuthState };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === "GET") {
        const asset = handleAsset(url.pathname);
        if (asset) return asset;
      }

      const config = parseConfig(env);

      if (request.method === "GET" && url.pathname === "/health") {
        return handleHealth(env);
      }

      if (request.method === "GET" && url.pathname === "/.well-known/droplet-auth/jwks.json") {
        return handleJwks(request, env);
      }

      if (request.method === "GET" && url.pathname === "/admin") {
        return handleAdminPage(request, env, config);
      }

      if (url.pathname.startsWith("/api/admin/")) return handleAdminApi(request, env, config, url.pathname);
      if (url.pathname === "/enroll" || url.pathname === "/enroll/success") return handleEnrollPage(request, env);
      if (url.pathname.startsWith("/api/enroll/")) return handleEnrollApi(request, env, config, url.pathname);
      if (request.method === "GET" && url.pathname === "/login") return handleLoginPage(request, config);
      if (url.pathname.startsWith("/api/login/")) return handleLoginApi(request, env, config, url.pathname);
      if (url.pathname === "/api/token/exchange") return handleTokenExchange(request, env, config);

      return new Response("Not found", { status: 404 });
    } catch (error) {
      if (error instanceof ConfigError) return Response.json({ ok: false, error: error.message }, { status: 400 });
      throw error;
    }
  },
};
