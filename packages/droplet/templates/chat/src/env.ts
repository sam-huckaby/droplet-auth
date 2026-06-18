import type { Env } from "./types";

export const DEFAULT_MAX_UPLOAD_BYTES = 1073741824;
export const DEFAULT_FILE_TTL_SECONDS = 604800;

export interface AppConfig {
  roomName: string;
  publicOrigin: string;
  roomDescription?: string;
  maxUploadBytes: number;
  fileTtlSeconds: number;
  agentApiKey: string;
  auth: { enabled: false } | { enabled: true; authOrigin: string; appId: string; authService: Fetcher };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function parseConfig(env: Env): AppConfig {
  const authOrigin = env.AUTH_ORIGIN?.trim();
  const appId = env.APP_ID?.trim();
  const authEnabled = Boolean(authOrigin && appId);

  if (authEnabled && !env.DROPLET_AUTH) {
    throw new ConfigError("DROPLET_AUTH binding is required when AUTH_ORIGIN and APP_ID enable human UI auth");
  }

  if (!env.PUBLIC_ORIGIN?.trim()) throw new ConfigError("PUBLIC_ORIGIN is required");
  if (!env.AGENT_API_KEY?.trim()) throw new ConfigError("AGENT_API_KEY is required");

  const maxUploadBytes = parseMaxUploadBytes(env.MAX_UPLOAD_BYTES);
  const fileTtlSeconds = parsePositiveInteger(env.FILE_TTL_SECONDS, "FILE_TTL_SECONDS", DEFAULT_FILE_TTL_SECONDS);

  return {
    roomName: env.ROOM_NAME?.trim() || "droplet-chat",
    publicOrigin: env.PUBLIC_ORIGIN.trim(),
    roomDescription: env.ROOM_DESCRIPTION?.trim() || undefined,
    maxUploadBytes,
    fileTtlSeconds,
    agentApiKey: env.AGENT_API_KEY,
    auth: authEnabled ? { enabled: true, authOrigin: authOrigin!, appId: appId!, authService: env.DROPLET_AUTH! } : { enabled: false },
  };
}

export function parseMaxUploadBytes(value: string | undefined): number {
  return parsePositiveInteger(value, "MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES);
}

export function parsePositiveInteger(value: string | undefined, name: string, defaultValue: number): number {
  const raw = value?.trim() || String(defaultValue);
  if (!/^\d+$/.test(raw)) throw new ConfigError(`${name} must be a positive integer`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new ConfigError(`${name} must be a positive safe integer`);
  return parsed;
}
