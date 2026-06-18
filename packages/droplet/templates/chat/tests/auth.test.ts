import { afterEach, describe, expect, it, vi } from "vitest";
import { constantTimeEqual, isAgentApiKeyShape, requireAgentApiKey } from "../src/auth/agent-key";
import { createAuthRedirect, handleAuthCallback } from "@whnvr/droplet/auth/worker";

describe("agent API key auth", () => {
  it("rejects missing bearer token", async () => {
    const response = await requireAgentApiKey(new Request("https://chat.example.com/api/messages"), "secret");
    expect(response?.status).toBe(401);
  });

  it("rejects incorrect bearer token", async () => {
    const response = await requireAgentApiKey(new Request("https://chat.example.com/api/messages", { headers: { authorization: "Bearer wrong" } }), "secret");
    expect(response?.status).toBe(403);
  });

  it("accepts correct bearer token", async () => {
    const response = await requireAgentApiKey(new Request("https://chat.example.com/api/messages", { headers: { authorization: "Bearer secret" } }), "secret");
    expect(response).toBeNull();
    await expect(constantTimeEqual("secret", "secret")).resolves.toBe(true);
  });

  it("recognizes generated key shape", () => {
    expect(isAgentApiKeyShape("droplet_agent_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ_1234567890")).toBe(true);
    expect(isAgentApiKeyShape("not-a-key")).toBe(false);
  });
});

describe("droplet auth helper", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates droplet-auth login redirects", () => {
    const response = createAuthRedirect(new Request("https://chat.example.com/"), { appId: "chat", authOrigin: "https://auth.example.com" });
    const location = new URL(response.headers.get("location") ?? "");
    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://auth.example.com");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("app")).toBe("chat");
  });

  it("uses DROPLET_AUTH service binding for callback token exchange", async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    const authService = {
      fetch: vi.fn(async () => Response.json({ session: "token", expiresAt: "2030-01-01T00:00:00.000Z" })),
    } as unknown as Fetcher;
    const response = await handleAuthCallback(new Request("https://chat.example.com/?code=abc"), { appId: "chat", authOrigin: "https://auth.example.com", authService });
    expect(response?.status).toBe(303);
    expect(response?.headers.get("set-cookie")).toContain("da_session=token");
    expect(authService.fetch).toHaveBeenCalledOnce();
    expect(globalFetch).not.toHaveBeenCalled();
  });
});
