import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_FILE_TTL_SECONDS, DEFAULT_MAX_UPLOAD_BYTES, parseConfig, parseMaxUploadBytes, parsePositiveInteger } from "../src/env";
import type { Env } from "../src/types";

const baseEnv = {
  ROOM: {} as Env["ROOM"],
  FILES: {} as Env["FILES"],
  PUBLIC_ORIGIN: "https://chat.example.com",
  AGENT_API_KEY: "droplet_agent_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ",
} satisfies Env;

describe("env parsing", () => {
  it("defaults MAX_UPLOAD_BYTES to 1 GiB", () => {
    expect(parseMaxUploadBytes(undefined)).toBe(DEFAULT_MAX_UPLOAD_BYTES);
  });

  it("rejects malformed MAX_UPLOAD_BYTES", () => {
    expect(() => parseMaxUploadBytes("abc")).toThrow(ConfigError);
    expect(() => parseMaxUploadBytes("0")).toThrow(ConfigError);
  });

  it("defaults FILE_TTL_SECONDS to 7 days", () => {
    expect(parsePositiveInteger(undefined, "FILE_TTL_SECONDS", DEFAULT_FILE_TTL_SECONDS)).toBe(604800);
    expect(parseConfig(baseEnv).fileTtlSeconds).toBe(DEFAULT_FILE_TTL_SECONDS);
  });

  it("parses configured FILE_TTL_SECONDS", () => {
    expect(parseConfig({ ...baseEnv, FILE_TTL_SECONDS: "3600" }).fileTtlSeconds).toBe(3600);
  });

  it("rejects malformed FILE_TTL_SECONDS", () => {
    expect(() => parseConfig({ ...baseEnv, FILE_TTL_SECONDS: "never" })).toThrow(ConfigError);
    expect(() => parseConfig({ ...baseEnv, FILE_TTL_SECONDS: "0" })).toThrow(ConfigError);
    expect(() => parseConfig({ ...baseEnv, FILE_TTL_SECONDS: "-1" })).toThrow(ConfigError);
  });

  it("disables human auth unless AUTH_ORIGIN and APP_ID are both set", () => {
    expect(parseConfig(baseEnv).auth.enabled).toBe(false);
    expect(parseConfig({ ...baseEnv, AUTH_ORIGIN: "https://auth.example.com" }).auth.enabled).toBe(false);
    expect(parseConfig({ ...baseEnv, APP_ID: "chat" }).auth.enabled).toBe(false);
  });

  it("requires DROPLET_AUTH when human auth is enabled", () => {
    expect(() => parseConfig({ ...baseEnv, AUTH_ORIGIN: "https://auth.example.com", APP_ID: "chat" })).toThrow(ConfigError);
  });

  it("enables human auth with DROPLET_AUTH binding", () => {
    const authService = { fetch: async () => new Response("ok") } as unknown as Fetcher;
    const config = parseConfig({ ...baseEnv, AUTH_ORIGIN: "https://auth.example.com", APP_ID: "chat", DROPLET_AUTH: authService });
    expect(config.auth.enabled).toBe(true);
    if (config.auth.enabled) expect(config.auth.authService).toBe(authService);
  });
});
