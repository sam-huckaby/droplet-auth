import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthRedirect, handleAuthCallback } from "@whnvr/droplet/auth/worker";

describe("droplet auth worker helper", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates droplet-auth login redirects", () => {
    const response = createAuthRedirect(new Request("https://tasks.example.com/tasks/1"), { appId: "tasks", authOrigin: "https://auth.example.com" });
    const location = new URL(response.headers.get("location") ?? "");
    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://auth.example.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("app")).toBe("tasks");
  });

  it("uses AUTH_SERVICE for callback token exchange when present", async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    const authService = {
      fetch: vi.fn(async () => Response.json({ session: "token", expiresAt: "2030-01-01T00:00:00.000Z" })),
    } as unknown as Fetcher;
    const response = await handleAuthCallback(new Request("https://tasks.example.com/?code=abc"), { appId: "tasks", authOrigin: "https://auth.example.com", authService });
    expect(response?.status).toBe(303);
    expect(response?.headers.get("set-cookie")).toContain("da_session=token");
    expect(authService.fetch).toHaveBeenCalledOnce();
    expect(globalFetch).not.toHaveBeenCalled();
  });
});
