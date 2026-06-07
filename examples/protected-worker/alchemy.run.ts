import alchemy from "alchemy";
import { Worker, WorkerRef } from "alchemy/cloudflare";

const app = await alchemy("droplet-auth-protected-worker");

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const authOrigin = requireEnv("AUTH_ORIGIN");
const authWorkerName = requireEnv("AUTH_WORKER_NAME");
const appId = requireEnv("APP_ID");
const protectedWorkerName = process.env.PROTECTED_WORKER_NAME?.trim() || `${appId}-protected`;

export const worker = await Worker("protected-worker", {
  name: protectedWorkerName,
  entrypoint: "./examples/protected-worker/src/index.ts",
  bindings: {
    AUTH_ORIGIN: authOrigin,
    AUTH_SERVICE: WorkerRef({ service: authWorkerName }),
    APP_ID: appId,
  },
  compatibilityDate: "2026-06-06",
  compatibilityFlags: ["nodejs_compat"],
  url: true,
});

console.log(`
Protected Worker deployment

Configured:
  Worker name: ${protectedWorkerName}
  APP_ID: ${appId}
  AUTH_ORIGIN: ${authOrigin}
  AUTH_WORKER_NAME: ${authWorkerName}

Alchemy:
  Worker name: ${worker.name}
  Worker URL: ${worker.url ?? "not enabled"}

Add this origin to the auth service ALLOWED_APPS, then redeploy the auth service:

  ALLOWED_APPS={"${appId}":"${worker.url ?? `https://${protectedWorkerName}.<your-worker-root>`}"}

Test:
  ${worker.url ?? "<protected-worker-url>"}

Debug:
  ${worker.url ? `${worker.url}/__debug` : "<protected-worker-url>/__debug"}
`);

await app.finalize();
