import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const authOrigin = requireEnv("AUTH_ORIGIN");
const authWorkerName = requireEnv("AUTH_WORKER_NAME");
const appId = requireEnv("APP_ID");
const protectedWorkerName = process.env.PROTECTED_WORKER_NAME?.trim() || `${appId}-protected`;

export default Alchemy.Stack(
  "droplet-auth-protected-worker",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function*() {
    const worker = yield* Cloudflare.Worker("protected-worker", {
      name: protectedWorkerName,
      main: "./src/index.ts",
      env: {
        AUTH_ORIGIN: authOrigin,
        APP_ID: appId,
      },
      compatibility: {
        date: "2026-06-06",
        flags: ["nodejs_compat"],
      },
      url: true,
    });

    yield* worker.bind("AUTH_SERVICE", {
      bindings: [
        {
          type: "service",
          name: "AUTH_SERVICE",
          service: authWorkerName,
        },
      ],
    });

    console.log(`
Protected Worker deployment

Configured:
  Worker name: ${protectedWorkerName}
  APP_ID: ${appId}
  AUTH_ORIGIN: ${authOrigin}
  AUTH_WORKER_NAME: ${authWorkerName}

Add this origin to the auth service ALLOWED_APPS, then redeploy the auth service:

  ALLOWED_APPS={"${appId}":"https://${protectedWorkerName}.<your-worker-root>"}

Test:
  https://${protectedWorkerName}.<your-worker-root>

Debug:
  https://${protectedWorkerName}.<your-worker-root>/__debug
`);

    return { worker };
  }),
);
