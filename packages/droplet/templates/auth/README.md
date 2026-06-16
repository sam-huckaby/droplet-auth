# Droplet Auth App

Droplet Auth is a passkey-backed auth server for Cloudflare Workers. It runs in your Cloudflare account and acts as an identity provider for your web apps.

Protected apps redirect users to Droplet Auth for login, then verify app-scoped sessions with the helper APIs from `@whnvr/droplet/auth/worker`.

This project is beta. Breaking changes are acceptable until the project exits beta.

## Environment

Copy the example env file before deploying:

```sh
cp .env.example .env
```

For generated standalone auth apps, copy `.env.example` to `.env` from the app directory.

### WORKER_ROOT

Your Cloudflare account `workers.dev` root, without protocol.

```txt
WORKER_ROOT=myteam.workers.dev
```

Droplet Auth combines this with `AUTH_WORKER_NAME` to derive the auth server origin:

```txt
https://${AUTH_WORKER_NAME}.${WORKER_ROOT}
```

### AUTH_WORKER_NAME

The Worker script/subdomain name for the auth server.

```txt
AUTH_WORKER_NAME=droplet-auth
```

This determines the public auth origin where users log in. With the example above and `WORKER_ROOT=myteam.workers.dev`, the auth origin is:

```txt
https://droplet-auth.myteam.workers.dev
```

### ALLOWED_APPS

A JSON object mapping protected app IDs to allowed HTTPS origins.

```txt
ALLOWED_APPS={"photos":"https://photos.example.com"}
```

Each protected app must use an app ID listed here. Droplet Auth uses this map to validate login requests, return URLs, and app-scoped passkey access.

### BOOTSTRAP_PW

Temporary bootstrap password used to create the first admin passkey.

Set this for first setup or recovery. After you have a working admin passkey, set `ALLOW_BOOTSTRAP_PW=false` and redeploy.

### ALLOW_BOOTSTRAP_PW

Controls whether bootstrap password login is enabled.

```txt
ALLOW_BOOTSTRAP_PW=true
```

Use `true` for first setup or recovery. Use `false` once passkey admin access is established.

### AUTH_PRIVATE_KEY

ES256 private JWK used to sign app session JWTs.

Generate it with:

```sh
bun run generate:key
```

Protected apps never receive this private key. They verify sessions through the public JWKS endpoint.

### ALCHEMY_PASSWORD

Password used by Alchemy to encrypt secrets in local `.alchemy` state.

Keep this stable for the deployment and do not commit it.

### Secret Uploads

For this Alchemy deployment, `.env` secret values are uploaded as Cloudflare Worker `secret_text` bindings. Do not commit `.env`.

## What It Provides

### Auth Server

- Passkey login
- Admin portal
- Enrollment links
- App-scoped non-admin passkeys
- JWT app sessions
- JWKS endpoint
- Audit/event views
- SQLite-backed Durable Object state

### Identity Provider Flow

Protected apps use Droplet Auth as their identity provider:

1. The app redirects unauthenticated users to `/login?app=...&returnTo=...`.
2. Droplet Auth verifies the user with a passkey.
3. Droplet Auth returns a short-lived callback code.
4. The protected app exchanges the code for an app session.
5. The protected app verifies the session JWT with Droplet Auth public keys.

### Stack

- Runtime: Cloudflare Workers
- State: SQLite-backed Durable Object `AuthState`
- Orchestration: Alchemy v2
- Package manager: Bun
- WebAuthn: `@simplewebauthn/server`
- App sessions: ES256 JWTs signed with ECDSA P-256

## First Run

1. Run `bunx alchemy configure` if you have not configured Alchemy for Cloudflare yet.
2. Copy `.env.example` to `.env`.
3. Set `WORKER_ROOT`, `AUTH_WORKER_NAME`, and `ALLOWED_APPS`.
4. Set `BOOTSTRAP_PW`.
5. Set `ALLOW_BOOTSTRAP_PW=true`.
6. Set `AUTH_PRIVATE_KEY` from `bun run generate:key`, or copy the generated key from `bun run setup:print`.
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

- Bootstrap password login only when `ALLOW_BOOTSTRAP_PW` is exactly `true`
- Admin passkey login
- One-time enrollment link creation
- Admin/non-admin enrollment flag
- App-scoped non-admin passkey enrollment
- Passkey listing
- Passkey email and label updates
- Passkey revocation
- Recent audit history
- Per-passkey app usage summaries
- Per-app usage summaries

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

## Beta Limitations

- No key rotation yet, but JWKS includes `kid`.
- No email invitations; enrollment links are displayed for admins to copy/open.
- Bootstrap password attempts are rate limited by recent failed audit events per IP, but this should still be reviewed before high-risk production deployments.
- Revocation is enforced for new auth/token exchanges; protected apps that cache JWTs do not get instant offline revocation.
- The UI is intentionally simple server-rendered HTML with small inline WebAuthn scripts.
- Browser passkey flows still need manual validation on target browsers before production use.

## Development

### Install

Install dependencies from the app directory:

```sh
bun install
```

### Setup Summary

Print the setup summary and generate a private key if one is missing:

```sh
bun run setup:print
```

### Deploy

Deploy through Alchemy:

```sh
bun run deploy
```

Do not treat Wrangler as the source of truth for deployment config. Wrangler may still be used underneath Cloudflare tooling.

### Check And Test

Use the scoped scripts:

```sh
bun run check
bun run test
```

Do not run bare `bun test`; it may discover ignored local workspace directories such as `vendor/`.

### Protected Worker Example

After the auth service is deployed and you have an enrolled passkey, deploy the example protected Worker:

```sh
AUTH_ORIGIN=https://<your-auth-worker-origin> \
AUTH_WORKER_NAME=<your-auth-worker-script-name> \
APP_ID=photos \
PROTECTED_WORKER_NAME=photos-protected \
bun run --cwd examples/protected-worker alchemy deploy ./alchemy.run.ts
```

`AUTH_WORKER_NAME` creates a Cloudflare service binding from the protected Worker to the auth Worker. This avoids public Worker-to-Worker `workers.dev` subrequests during token exchange and JWKS verification.

The example deploy prints its workers.dev URL. Add that origin to the auth service `.env`:

```sh
ALLOWED_APPS={"photos":"https://<printed-protected-worker-origin>"}
```

Then redeploy the auth service:

```sh
bun run deploy
```

Open the protected Worker URL. It should redirect to the auth service login panel, then return and display `Hello <email>` after passkey login.
