# Droplet Auth App

Beta self-hosted passkey authentication for Cloudflare Workers.

Droplet Auth lets you deploy your own auth Worker, enroll passkeys, and protect private Worker apps without giving those apps a shared signing secret.

## Status

This project is beta. Breaking changes are acceptable until the project exits beta.

## Stack

- Runtime: Cloudflare Workers
- State: SQLite-backed Durable Object `AuthState`
- Orchestration: Alchemy v2
- Package manager: Bun
- App structure: TypeScript with Effect v4 beta dependency available
- WebAuthn: `@simplewebauthn/server`
- App sessions: ES256 JWTs signed with ECDSA P-256

## Configuration

Copy the example env file:

```sh
cp packages/auth-app/.env.example packages/auth-app/.env
```

Required non-secret config in `packages/auth-app/.env`:

```txt
WORKER_ROOT=myteam.workers.dev
AUTH_WORKER_NAME=droplet-auth
ALLOWED_APPS={"photos":"https://photos.example.com"}
```

`AUTH_ORIGIN` is derived by the deploy script:

```txt
https://${AUTH_WORKER_NAME}.${WORKER_ROOT}
```

Required secrets in `packages/auth-app/.env`:

```txt
BOOTSTRAP_PW=<strong password>
ALLOW_BOOTSTRAP_PW=true
AUTH_PRIVATE_KEY=<ES256 private JWK JSON>
```

Generate `AUTH_PRIVATE_KEY`:

```sh
bun run --cwd packages/auth-app generate:key
```

Store the printed JSON as the Cloudflare secret value.

For this Alchemy deployment, `.env` secret values are uploaded as Cloudflare Worker `secret_text` bindings. Do not commit `.env`.

## Deploy

Install dependencies:

```sh
bun install
```

Configure Alchemy for Cloudflare if you have not already:

```sh
bunx alchemy configure
```

Print the setup summary:

```sh
bun run --cwd packages/auth-app setup:print
```

Deploy through Alchemy:

```sh
bun run --cwd packages/auth-app deploy
```

Do not treat Wrangler as the source of truth for deployment config. Wrangler may still be used underneath Cloudflare tooling.

## First Run

1. Run `bunx alchemy configure`.
2. Copy `packages/auth-app/.env.example` to `packages/auth-app/.env`.
3. Set `WORKER_ROOT`, `AUTH_WORKER_NAME`, and `ALLOWED_APPS`.
4. Set `BOOTSTRAP_PW`.
5. Set `ALLOW_BOOTSTRAP_PW=true`.
6. Set `AUTH_PRIVATE_KEY` from `bun run --cwd packages/auth-app generate:key`, or copy the generated key from `bun run --cwd packages/auth-app setup:print`.
7. Deploy with Alchemy.
8. Visit the derived admin URL printed by deploy.
9. Log in with the bootstrap password.
10. Click `Create and open first admin enrollment link`.
11. Register the first passkey.
12. Return to `/admin` and log in with the admin passkey.
13. Set `ALLOW_BOOTSTRAP_PW=false` in `.env` and redeploy after recovery access is no longer needed.

If all admin passkeys are lost, set `ALLOW_BOOTSTRAP_PW=true` again and repeat the bootstrap recovery flow.

## Admin Portal

`/admin` supports:

- Bootstrap password login only when `ALLOW_BOOTSTRAP_PW` is exactly `true`.
- Admin passkey login.
- One-time enrollment link creation.
- Admin/non-admin enrollment flag.
- App-scoped non-admin passkey enrollment.
- Passkey listing.
- Passkey email and label updates.
- Passkey revocation.
- Recent audit history.
- Per-passkey app usage summaries.
- Per-app usage summaries.

Only passkeys with `isAdmin=true` can access the admin portal and sign into any app. Non-admin passkeys must be scoped to one configured app and can only sign into that app.

## Protect An App

Protected Worker apps need only:

```txt
AUTH_ORIGIN=https://auth.example.com
APP_ID=photos
```

Worker helper exports are available from `@whnvr/droplet/auth/worker`.

Example:

```ts
import { createAuthRedirect, handleAuthCallback, verifyAppSession } from "@whnvr/droplet/auth/worker";

export default {
  async fetch(request, env) {
    const callback = await handleAuthCallback(request, { appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN });
    if (callback) return callback;

    const session = await verifyAppSession(request, { appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN });
    if (!session) return createAuthRedirect(request, { appId: env.APP_ID, authOrigin: env.AUTH_ORIGIN });

    return new Response(`Hello ${session.email}`);
  },
};
```

Protected apps fetch public key material from:

```txt
GET /.well-known/droplet-auth/jwks.json
```

They never receive `AUTH_PRIVATE_KEY` or a shared session secret.

## Test With The Protected Worker Example

After the auth service is deployed and you have an enrolled passkey, deploy the example protected Worker:

```sh
AUTH_ORIGIN=https://<your-auth-worker-origin> \
AUTH_WORKER_NAME=<your-auth-worker-script-name> \
APP_ID=photos \
PROTECTED_WORKER_NAME=photos-protected \
bun run --cwd packages/auth-app alchemy deploy ./examples/protected-worker/alchemy.run.ts
```

`AUTH_WORKER_NAME` creates a Cloudflare service binding from the protected Worker to the auth Worker. This avoids public Worker-to-Worker `workers.dev` subrequests during token exchange and JWKS verification.

The example deploy prints its workers.dev URL. Add that origin to the auth service `.env`:

```sh
ALLOWED_APPS={"photos":"https://<printed-protected-worker-origin>"}
```

Then redeploy the auth service:

```sh
bun run --cwd packages/auth-app deploy
```

Open the protected Worker URL. It should redirect to the auth service login panel, then return and display `Hello <email>` after passkey login.

## Routes

- `GET /health`
- `GET /.well-known/droplet-auth/jwks.json`
- `GET /admin`
- `POST /api/admin/bootstrap-login`
- `POST /api/admin/bootstrap-enrollment-link`
- `POST /api/admin/passkey/options`
- `POST /api/admin/passkey/verify`
- `POST /api/admin/enrollment-links`
- `GET /api/admin/passkeys`
- `PATCH /api/admin/passkeys/:id`
- `POST /api/admin/passkeys/:id/revoke`
- `GET /api/admin/audit`
- `GET /enroll?k=...`
- `POST /api/enroll/options`
- `POST /api/enroll/verify`
- `GET /login?app=...&returnTo=...`
- `POST /api/login/options`
- `POST /api/login/verify`
- `POST /api/token/exchange`

## Tests

Use the scoped Vitest script:

```sh
bun run check
bun run test
```

Do not run bare `bun test`; it may discover ignored local workspace directories such as `vendor/`.

## Beta Limitations

- No key rotation yet, but JWKS includes `kid`.
- No email invitations; enrollment links are displayed for admins to copy/open.
- Bootstrap password attempts are rate limited by recent failed audit events per IP, but this should still be reviewed before high-risk production deployments.
- Revocation is enforced for new auth/token exchanges; protected apps that cache JWTs do not get instant offline revocation.
- The UI is intentionally simple server-rendered HTML with small inline WebAuthn scripts.
- Browser passkey flows still need manual validation on target browsers before production use.
