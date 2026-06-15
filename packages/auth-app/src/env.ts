import type { AllowedApps, AppConfig, Env } from "./types";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function parseConfig(env: Env): AppConfig {
  const authOrigin = parseAuthOrigin(env.AUTH_ORIGIN);
  const allowedApps = parseAllowedApps(env.ALLOWED_APPS);

  if (!env.BOOTSTRAP_PW) {
    throw new ConfigError("BOOTSTRAP_PW is required");
  }

  if (!env.AUTH_PRIVATE_KEY) {
    throw new ConfigError("AUTH_PRIVATE_KEY is required");
  }

  return {
    authOrigin,
    allowedApps,
    allowBootstrapPassword: env.ALLOW_BOOTSTRAP_PW === "true",
  };
}

export function parseAuthOrigin(value: string): URL {
  if (!value) {
    throw new ConfigError("AUTH_ORIGIN is required");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError("AUTH_ORIGIN must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ConfigError("AUTH_ORIGIN must use https");
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new ConfigError("AUTH_ORIGIN must be an origin without path, query, or hash");
  }

  return url;
}

export function parseAllowedApps(value: string): AllowedApps {
  if (!value) {
    throw new ConfigError("ALLOWED_APPS is required");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ConfigError("ALLOWED_APPS must be valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError("ALLOWED_APPS must be a JSON object");
  }

  const apps: AllowedApps = {};
  for (const [appId, origin] of Object.entries(parsed)) {
    if (!appId || typeof origin !== "string") {
      throw new ConfigError("ALLOWED_APPS must map app IDs to origin strings");
    }

    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigError(`ALLOWED_APPS.${appId} must be a valid URL`);
    }

    if (url.protocol !== "https:") {
      throw new ConfigError(`ALLOWED_APPS.${appId} must use https`);
    }

    if (url.pathname !== "/" || url.search || url.hash) {
      throw new ConfigError(`ALLOWED_APPS.${appId} must be an origin without path, query, or hash`);
    }

    apps[appId] = url.origin;
  }

  if (Object.keys(apps).length === 0) {
    throw new ConfigError("ALLOWED_APPS must contain at least one app");
  }

  return apps;
}

export function validateReturnTo(allowedApps: AllowedApps, appId: string, returnTo: string): URL {
  const allowedOrigin = allowedApps[appId];
  if (!allowedOrigin) {
    throw new ConfigError("Invalid app or return URL");
  }

  let url: URL;
  try {
    url = new URL(returnTo);
  } catch {
    throw new ConfigError("Invalid app or return URL");
  }

  if (url.origin !== allowedOrigin) {
    throw new ConfigError("Invalid app or return URL");
  }

  return url;
}
