import { generateAuthPrivateKey } from "./key";
import { requireSetupEnv, SetupConfigError } from "../src/setup-config";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

let setup;
try {
  setup = requireSetupEnv(process.env);
} catch (error) {
  if (error instanceof SetupConfigError) {
    console.error(`Setup config error: ${error.message}`);
    console.error("\nCreate .env from .env.example and fill in WORKER_ROOT, AUTH_WORKER_NAME, and ALLOWED_APPS.");
    process.exit(1);
  }
  throw error;
}

const generatedKey = process.env.AUTH_PRIVATE_KEY?.trim() ? undefined : await generateAuthPrivateKey();
const authPrivateKey = process.env.AUTH_PRIVATE_KEY?.trim() || generatedKey!;
const bootstrapPw = process.env.BOOTSTRAP_PW?.trim() || "<choose-a-strong-bootstrap-password>";
const allowBootstrapPw = process.env.ALLOW_BOOTSTRAP_PW?.trim() || "true";

console.log(`
Droplet Auth setup

1. Configure Alchemy for Cloudflare if you have not already:

   bunx alchemy configure

2. Confirm your derived auth origin:

   Worker name: ${setup.authWorkerName}
   Worker root: ${setup.workerRoot}
   AUTH_ORIGIN: ${setup.authOrigin}

3. Ensure .env contains these secret values before deployment.
   Alchemy uploads them as Cloudflare Worker secret_text bindings.

   BOOTSTRAP_PW=${shellQuote(bootstrapPw)}
   ALLOW_BOOTSTRAP_PW=${shellQuote(allowBootstrapPw)}
   AUTH_PRIVATE_KEY=${shellQuote(authPrivateKey)}

${generatedKey ? `   Generated AUTH_PRIVATE_KEY because it was missing from .env. Copy it into .env before deploying.\n` : ""}
4. Deploy:

   bun ./alchemy.run.ts

5. Open after deployment:

   Admin: ${setup.authOrigin}/admin
   Health: ${setup.authOrigin}/health
   JWKS: ${setup.authOrigin}/.well-known/droplet-auth/jwks.json

6. After enrolling your first admin passkey, update .env and redeploy:

   ALLOW_BOOTSTRAP_PW=false
   bun ./alchemy.run.ts
`);
