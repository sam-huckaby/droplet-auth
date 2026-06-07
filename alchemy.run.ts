import alchemy from "alchemy";
import { DurableObjectNamespace, Worker } from "alchemy/cloudflare";
import type { AuthState } from "./src/auth-state";
import { requireSetupEnv } from "./src/setup-config";

const app = await alchemy("droplet-auth");
const setup = requireSetupEnv(process.env);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const authState = DurableObjectNamespace<AuthState>("auth-state", {
  className: "AuthState",
  sqlite: true,
});

export const authWorker = await Worker("auth-worker", {
  name: setup.authWorkerName,
  entrypoint: "./src/index.ts",
  bindings: {
    AUTH_STATE: authState,
    AUTH_ORIGIN: setup.authOrigin,
    ALLOWED_APPS: setup.allowedAppsJson,
    BOOTSTRAP_PW: alchemy.secret.env.BOOTSTRAP_PW,
    ALLOW_BOOTSTRAP_PW: alchemy.secret.env.ALLOW_BOOTSTRAP_PW,
    AUTH_PRIVATE_KEY: alchemy.secret.env.AUTH_PRIVATE_KEY,
  },
  compatibilityDate: "2026-06-06",
  compatibilityFlags: ["nodejs_compat"],
  url: true,
});

console.log(`
Droplet Auth deployment

Configured:
  Worker name: ${setup.authWorkerName}
  Worker root: ${setup.workerRoot}
  Derived AUTH_ORIGIN: ${setup.authOrigin}

Alchemy:
  Worker name: ${authWorker.name}
  Worker URL: ${authWorker.url ?? "not enabled"}

Open:
  Admin: ${setup.authOrigin}/admin
  Health: ${setup.authOrigin}/health
  JWKS: ${setup.authOrigin}/.well-known/droplet-auth/jwks.json
`);

if (authWorker.url && authWorker.url !== setup.authOrigin) {
  console.warn(
    `WARNING: Derived AUTH_ORIGIN (${setup.authOrigin}) does not match Alchemy Worker URL (${authWorker.url}). Check WORKER_ROOT and AUTH_WORKER_NAME in .env.`,
  );
}

await app.finalize();
