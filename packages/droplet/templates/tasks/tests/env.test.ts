import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/env";
import type { Env } from "../src/types";

describe("parseConfig", () => {
  it("disables auth unless AUTH_ORIGIN and APP_ID are both set", () => {
    expect(parseConfig({ PROJECT_STATE: {} as Env["PROJECT_STATE"] }).auth.enabled).toBe(false);
    expect(parseConfig({ AUTH_ORIGIN: "https://auth.example.com", PROJECT_STATE: {} as Env["PROJECT_STATE"] }).auth.enabled).toBe(false);
    expect(parseConfig({ APP_ID: "tasks", PROJECT_STATE: {} as Env["PROJECT_STATE"] }).auth.enabled).toBe(false);
  });

  it("enables auth with optional service binding", () => {
    const authService = { fetch: async () => new Response("ok") } as unknown as Fetcher;
    const config = parseConfig({ PROJECT_NAME: "Build", AUTH_ORIGIN: "https://auth.example.com", APP_ID: "tasks", AUTH_SERVICE: authService, PROJECT_STATE: {} as Env["PROJECT_STATE"] });
    expect(config.projectName).toBe("Build");
    expect(config.auth.enabled).toBe(true);
    if (config.auth.enabled) expect(config.auth.authService).toBe(authService);
  });
});
