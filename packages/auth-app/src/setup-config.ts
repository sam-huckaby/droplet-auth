export interface SetupConfig {
  authWorkerName: string;
  workerRoot: string;
  authOrigin: string;
  allowedAppsJson: string;
}

export class SetupConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupConfigError";
  }
}

export function requireSetupEnv(env: Record<string, string | undefined>): SetupConfig {
  const authWorkerName = requireValue(env, "AUTH_WORKER_NAME");
  const workerRoot = requireValue(env, "WORKER_ROOT");
  const allowedAppsJson = requireValue(env, "ALLOWED_APPS");

  validateWorkerName(authWorkerName);
  validateWorkerRoot(workerRoot);
  validateAllowedAppsJson(allowedAppsJson);

  return {
    authWorkerName,
    workerRoot,
    authOrigin: deriveAuthOrigin(authWorkerName, workerRoot),
    allowedAppsJson,
  };
}

export function deriveAuthOrigin(authWorkerName: string, workerRoot: string): string {
  validateWorkerName(authWorkerName);
  validateWorkerRoot(workerRoot);
  return `https://${authWorkerName}.${workerRoot}`;
}

export function validateWorkerName(value: string): void {
  if (!value) throw new SetupConfigError("AUTH_WORKER_NAME is required");
  if (value.length > 63) throw new SetupConfigError("AUTH_WORKER_NAME must be 63 characters or fewer");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) {
    throw new SetupConfigError("AUTH_WORKER_NAME must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen");
  }
}

export function validateWorkerRoot(value: string): void {
  if (!value) throw new SetupConfigError("WORKER_ROOT is required");
  if (value.includes("://") || value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new SetupConfigError("WORKER_ROOT must be a hostname like myteam.workers.dev, not a URL");
  }
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value)) {
    throw new SetupConfigError("WORKER_ROOT must be a valid lowercase hostname");
  }
  if (!value.endsWith(".workers.dev")) {
    throw new SetupConfigError("WORKER_ROOT should be your Cloudflare workers.dev root, like myteam.workers.dev");
  }
}

export function validateAllowedAppsJson(value: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new SetupConfigError("ALLOWED_APPS must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SetupConfigError("ALLOWED_APPS must be a JSON object");
  }
  for (const [appId, origin] of Object.entries(parsed)) {
    if (!appId || typeof origin !== "string") throw new SetupConfigError("ALLOWED_APPS must map app IDs to HTTPS origin strings");
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new SetupConfigError(`ALLOWED_APPS.${appId} must be a valid URL`);
    }
    if (url.protocol !== "https:" || url.origin !== origin) {
      throw new SetupConfigError(`ALLOWED_APPS.${appId} must be an HTTPS origin without path, query, or hash`);
    }
  }
}

function requireValue(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new SetupConfigError(`${name} is required`);
  return value;
}
