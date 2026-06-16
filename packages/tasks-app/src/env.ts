import type { Env } from "./types";

export interface AppConfig {
  projectName: string;
  auth: { enabled: false } | { enabled: true; authOrigin: string; appId: string; authService?: Fetcher };
}

export function parseConfig(env: Env): AppConfig {
  const projectName = env.PROJECT_NAME?.trim() || "Untitled Project";
  const authOrigin = env.AUTH_ORIGIN?.trim();
  const appId = env.APP_ID?.trim();
  if (authOrigin && appId) {
    return { projectName, auth: { enabled: true, authOrigin, appId, authService: env.AUTH_SERVICE } };
  }
  return { projectName, auth: { enabled: false } };
}
