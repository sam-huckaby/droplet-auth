import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import type { AuthState } from "./src/auth-state";
import { requireSetupEnv } from "./src/setup-config";

const setup = requireSetupEnv(process.env);

export default Alchemy.Stack(
  "droplet-auth",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const authState = Cloudflare.DurableObjectNamespace<AuthState>("auth-state", {
      className: "AuthState",
    });

    const authWorker = yield* Cloudflare.Worker("auth-worker", {
      name: setup.authWorkerName,
      main: "./src/index.ts",
      env: {
        AUTH_STATE: authState,
        AUTH_ORIGIN: setup.authOrigin,
        ALLOWED_APPS: setup.allowedAppsJson,
      },
      compatibility: {
        date: "2026-06-06",
        flags: ["nodejs_compat"],
      },
      url: true,
    });

    yield* authWorker.bind("BOOTSTRAP_PW", {
      bindings: [{ type: "secret_text", name: "BOOTSTRAP_PW", text: requireSecret("BOOTSTRAP_PW") }],
    });
    yield* authWorker.bind("ALLOW_BOOTSTRAP_PW", {
      bindings: [{ type: "secret_text", name: "ALLOW_BOOTSTRAP_PW", text: requireSecret("ALLOW_BOOTSTRAP_PW") }],
    });
    yield* authWorker.bind("AUTH_PRIVATE_KEY", {
      bindings: [{ type: "secret_text", name: "AUTH_PRIVATE_KEY", text: requireSecret("AUTH_PRIVATE_KEY") }],
    });

    console.log(`
Droplet Auth deployment

Configured:
  Worker name: ${setup.authWorkerName}
  Worker root: ${setup.workerRoot}
  Derived AUTH_ORIGIN: ${setup.authOrigin}

Open:
  Admin: ${setup.authOrigin}/admin
  Health: ${setup.authOrigin}/health
  JWKS: ${setup.authOrigin}/.well-known/droplet-auth/jwks.json
`);

    return { authWorker, authOrigin: setup.authOrigin };
  }),
);

function requireSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
