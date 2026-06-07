# PLAN.md — Droplet Auth for Cloudflare Workers

## Project Summary

Build a reusable, self-hosted, passkey-backed authentication service for Cloudflare Workers.

This project should allow any user to deploy their own authentication Worker to their own Cloudflare account and use it to protect their private Cloudflare Worker apps.

The service will provide:

1. A configurable auth origin, such as `https://auth.example.com`.
2. A passkey-backed login flow.
3. A bootstrap-password recovery/admin flow controlled by Cloudflare secrets.
4. One-time enrollment links generated from the admin portal.
5. A Durable Object-backed credential registry.
6. Asymmetric signing for app sessions and token verification.
7. A small JavaScript/TypeScript client library that protected apps can drop in.
8. An admin portal for managing passkeys, enrollment links, app allowlist, and audit history.
9. Alchemy v2 orchestration for Cloudflare infrastructure.
10. Effect v4 beta for application structure and runtime flow.

This is a beta project. Breaking changes are acceptable until the project exits beta.

---

## Core Goals

### Primary Goals

* Allow a user to deploy a standalone passkey auth service to Cloudflare Workers.
* Allow that service to protect multiple small Worker apps.
* Let the deployer configure their own auth domain/origin.
* Let the deployer bootstrap the first admin passkey using a Cloudflare secret.
* Let the deployer disable bootstrap password login after passkey enrollment.
* Let the deployer re-enable bootstrap password login if all admin passkeys are lost.
* Let admins create one-time enrollment links from the admin portal.
* Let admins choose whether each enrollment link creates an admin passkey.
* Let each passkey have an associated email address and label.
* Let admins update the email and label on existing passkeys.
* Let admins delete/revoke existing passkeys.
* Track which passkeys are used to log into which apps.
* Use asymmetric signing so protected apps do not need shared secrets.
* Use Alchemy v2 for orchestration instead of treating Wrangler as the primary deployment interface.
* Use Effect v4 beta for core application composition and error handling.
* Vendor Alchemy and Effect source into `vendor/` as git subtrees so coding agents can inspect implementation details.

### Non-Goals for Initial Beta

* Multi-tenant hosted SaaS.
* Public user registration.
* OAuth/OIDC provider compatibility.
* Full enterprise policy engine.
* Backward compatibility guarantees.
* Complex RBAC.
* Team invitation emails.
* Password-based app login.
* Shared secret-based app verification.

---

## Deployment Model

Each user deploys their own auth service.

Example deployed origins:

```txt
https://auth.example.com
https://passkeys.my-family-domain.com
https://login.my-private-workers.dev
```

The auth origin must be configurable. Do not hard-code `auth.yourdomain.com`.

The protected apps should be configured to trust a specific deployed auth origin.

---

## Orchestration Model

Use **Alchemy v2** for infrastructure orchestration.

Do not build the repo around Wrangler as the primary orchestration tool.

Wrangler may still be used under the hood by Cloudflare tooling or for local compatibility when necessary, but project deployment should be expressed through Alchemy stacks.

Alchemy is a TypeScript-native Infrastructure-as-Code system for deploying infrastructure, including Cloudflare resources.

Alchemy v2 tutorial material installs Alchemy and Effect together, so this project should lean into that pairing.

---

## Required Cloudflare Secrets

The Worker must require these secrets:

```txt
BOOTSTRAP_PW
ALLOW_BOOTSTRAP_PW
AUTH_PRIVATE_KEY
```

### `BOOTSTRAP_PW`

A strong password set by the deployer.

Used to access the admin portal only when `ALLOW_BOOTSTRAP_PW` is enabled.

This password is not used to enroll passkeys directly. It is only used to access the admin portal or bootstrap recovery flow.

### `ALLOW_BOOTSTRAP_PW`

A string secret.

Expected values:

```txt
true
false
```

When set to `true`, the admin portal should allow login using `BOOTSTRAP_PW`.

When set to `false`, the admin portal should only allow passkey login by an admin passkey.

If the user loses all admin passkeys, they can update the Cloudflare secret back to `true` and regain access using `BOOTSTRAP_PW`.

### `AUTH_PRIVATE_KEY`

The private key used by the auth service to sign app sessions or exchange tokens.

This should be generated per deployment.

For the initial beta, store this as a JSON Web Key for an ECDSA P-256 private key usable with `ES256` signing. The JWK must include private key material and must only be stored as the Cloudflare secret value.

Protected apps should not receive this private key.

Protected apps should verify tokens using the corresponding public key exposed by the auth service.

---

## Public Key Exposure

The auth service should expose its public key at:

```txt
GET /.well-known/droplet-auth/jwks.json
```

or:

```txt
GET /api/public-key
```

Preferred first version:

```txt
GET /.well-known/droplet-auth/jwks.json
```

Protected apps can fetch and cache this public key.

The public key can be cached because key rotation is not part of the first beta milestone, but design the response so future rotation is possible.

Suggested response shape:

```json
{
  "keys": [
    {
      "kid": "default",
      "kty": "EC",
      "crv": "P-256",
      "use": "sig",
      "alg": "ES256",
      "x": "base64url-public-key-x-coordinate",
      "y": "base64url-public-key-y-coordinate"
    }
  ]
}
```

Use ECDSA P-256 with SHA-256 (`ES256`) for app session signing. This keeps the implementation aligned with broadly supported Web Crypto and JOSE/JWKS tooling while maintaining a high security posture for SaaS deployments.

---

## Configuration

### Required Variables

```txt
AUTH_ORIGIN
ALLOWED_APPS
```

### `AUTH_ORIGIN`

Example:

```txt
https://auth.example.com
```

This must be configurable per deployment.

Every generated link must use `AUTH_ORIGIN`.

Bad:

```ts
"https://auth.yourdomain.com/enroll"
```

Good:

```ts
`${env.AUTH_ORIGIN}/enroll?k=${token}`
```

### `ALLOWED_APPS`

Use a human-readable JSON map.

Example:

```json
{
  "photos": "https://photos.example.com",
  "huckabuilder": "https://builder.example.com",
  "family-dashboard": "https://family.example.com"
}
```

In Alchemy stack config, this may be represented as a stringified JSON variable if necessary:

```ts
ALLOWED_APPS: JSON.stringify({
  photos: "https://photos.example.com",
  huckabuilder: "https://builder.example.com",
  "family-dashboard": "https://family.example.com"
})
```

At runtime, parse it into:

```ts
type AllowedApps = Record<string, string>;
```

Validation rules:

* `appId` must exist as a key in `ALLOWED_APPS`.
* `returnTo` origin must match the configured origin for that `appId`.
* Unknown apps must be rejected.
* Mismatched return origins must be rejected.

---

## Recommended Alchemy Stack Shape

Create an Alchemy stack for the auth service.

Suggested file:

```txt
alchemy.run.ts
```

or:

```txt
stacks/auth.ts
```

The stack should define:

* Worker
* Durable Object binding
* Durable Object migration
* custom domain/route if configured
* required secrets
* vars:

  * `AUTH_ORIGIN`
  * `ALLOWED_APPS`

Pseudo-shape:

```ts
import alchemy from "alchemy";
import { Worker } from "alchemy/cloudflare";

const app = await alchemy("droplet-auth");

const auth = await Worker("droplet-auth-worker", {
  name: "droplet-auth",
  entrypoint: "./src/index.ts",
  compatibilityDate: "2026-06-01",
  bindings: {
    AUTH_ORIGIN: process.env.AUTH_ORIGIN,
    ALLOWED_APPS: JSON.stringify({
      photos: "https://photos.example.com",
      huckabuilder: "https://builder.example.com"
    })
  },
  // durable object and secret configuration should be implemented
  // according to the actual Alchemy v2 Cloudflare APIs in vendor/alchemy
});

await app.finalize();
```

The exact Alchemy APIs should be confirmed by reading the vendored Alchemy source and current v2 docs.

---

## Vendored Source

Create a `vendor/` directory.

Add Alchemy and Effect as git subtrees:

```txt
vendor/
├── alchemy/
└── effect/
```

Suggested commands:

```sh
mkdir -p vendor

git subtree add --prefix vendor/alchemy https://github.com/alchemy-run/alchemy.git main --squash

git subtree add --prefix vendor/effect https://github.com/Effect-TS/effect.git main --squash
```

If Effect v4 beta lives on a specific branch or tag, use that branch/tag instead of `main`.

As of initial setup, the npm beta package is `effect@4.0.0-beta.78`, while the upstream `main` branch reports `3.21.3` and no matching `4.0.0-beta.78` git tag is exposed. Use the installed beta package for application code, and treat `vendor/effect` as inspectable upstream source until a source-confirmed v4 beta branch or tag is identified.

The agent should consult these source trees directly when building with Alchemy or Effect.

---

## Recommended Stack

```txt
Runtime: Cloudflare Workers
State: Durable Object with SQLite-backed storage
Orchestration: Alchemy v2
Application model: Effect v4 beta
Router: Hono or Effect-native HTTP if practical
Language: TypeScript
WebAuthn: @simplewebauthn/server and @simplewebauthn/browser
UI: Server-rendered HTML first, optional client-side enhancement
Package manager: bun
Testing: Vitest or Effect-native testing tools
```

Effect is a TypeScript framework for building robust applications with typed effects, concurrency, and structured error handling.

---

## Repository Structure

```txt
.
├── AGENT.md
├── PLAN.md
├── README.md
├── package.json
├── bun.lock
├── tsconfig.json
├── alchemy.run.ts
├── src
│   ├── index.ts
│   ├── env.ts
│   ├── auth-state.ts
│   ├── routes
│   │   ├── admin.ts
│   │   ├── enroll.ts
│   │   ├── login.ts
│   │   ├── token.ts
│   │   ├── well-known.ts
│   │   └── health.ts
│   ├── webauthn
│   │   ├── registration.ts
│   │   ├── authentication.ts
│   │   └── options.ts
│   ├── crypto
│   │   ├── cookies.ts
│   │   ├── signing.ts
│   │   ├── asymmetric.ts
│   │   ├── random.ts
│   │   └── hashing.ts
│   ├── html
│   │   ├── layout.ts
│   │   ├── admin.ts
│   │   ├── login.ts
│   │   └── enroll.ts
│   ├── client
│   │   ├── browser.ts
│   │   └── worker.ts
│   ├── effect
│   │   ├── services.ts
│   │   ├── errors.ts
│   │   └── runtime.ts
│   └── types.ts
├── examples
│   └── protected-worker
│       ├── src
│       │   └── index.ts
│       └── alchemy.run.ts
├── tests
│   ├── auth-state.test.ts
│   ├── enrollment-links.test.ts
│   ├── sessions.test.ts
│   ├── signing.test.ts
│   └── audit.test.ts
└── vendor
    ├── alchemy
    └── effect
```

---

## Runtime Concepts

### Auth Origin

The auth origin is the deployed origin of the auth service.

Example:

```txt
https://auth.example.com
```

This must be read from environment config:

```ts
env.AUTH_ORIGIN
```

Do not hard-code it.

### App ID

Every protected app identifies itself using an `appId`.

Example:

```ts
appId: "photos"
appId: "huckabuilder"
appId: "family-dashboard"
```

The `appId` is used for:

* session binding
* audit logs
* admin display
* allowed return URL validation
* future per-app policy support

### Admin Passkey

An admin passkey is a passkey with:

```ts
isAdmin: true
```

Only admin passkeys may log into the admin portal.

The first passkey created through the bootstrap first-run flow must always be an admin passkey.

When an admin creates an enrollment link, they may check a box to mark the enrollment link as creating an admin passkey.

### Non-Admin Passkey

A non-admin passkey has:

```ts
isAdmin: false
```

It may log into protected apps but may not access the admin portal.

### Enrollment Link

An enrollment link is a one-time-use URL generated by an admin.

Example:

```txt
https://auth.example.com/enroll?k=h78gr3hr97r3jrsui4hutishth3orhiuhru3risg4ns
```

The value in `k` should be a high-entropy random token.

The raw token should only be shown once.

The service should store a hash of the token, not the raw token.

When the link is used successfully, the token should be marked as consumed.

Enrollment links should include whether they create an admin passkey.

### Bootstrap Admin Session

When `ALLOW_BOOTSTRAP_PW=true`, the admin login page should offer a button to log in using the bootstrap password.

If the admin logs in using only `BOOTSTRAP_PW` and does not already have an admin passkey session, the UI should guide them into creating their first admin passkey.

---

## Durable Object: `AuthState`

The `AuthState` Durable Object owns all auth service state.

Use one singleton Durable Object instance for the whole auth service.

Suggested ID strategy:

```ts
const id = env.AUTH_STATE.idFromName("global");
const stub = env.AUTH_STATE.get(id);
```

The Durable Object should expose internal RPC-style methods through fetch routes or class methods depending on implementation style.

---

## Database Schema

Use SQLite-backed Durable Object storage.

### `passkeys`

```sql
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  email TEXT NOT NULL,
  label TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
```

### `challenges`

```sql
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL,
  context TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
```

`type` values:

```txt
registration
authentication
admin_authentication
```

`context` should be JSON.

### `enrollment_links`

```sql
CREATE TABLE IF NOT EXISTS enrollment_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  default_email TEXT,
  default_label TEXT,
  creates_admin_passkey INTEGER NOT NULL DEFAULT 0,
  created_by_passkey_id TEXT,
  created_via_bootstrap INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  consumed_at TEXT,
  consumed_by_passkey_id TEXT,
  revoked_at TEXT
);
```

### `sessions`

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  passkey_id TEXT,
  email TEXT,
  app_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
```

`type` values:

```txt
admin
app
bootstrap_admin
```

### `auth_codes`

```sql
CREATE TABLE IF NOT EXISTS auth_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  app_id TEXT NOT NULL,
  passkey_id TEXT NOT NULL,
  email TEXT NOT NULL,
  return_to TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
```

### `audit_events`

```sql
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  app_id TEXT,
  passkey_id TEXT,
  email TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  metadata TEXT NOT NULL
);
```

Suggested `event_type` values:

```txt
bootstrap_login_success
bootstrap_login_failed
admin_passkey_login_success
admin_passkey_login_failed
admin_passkey_required
enrollment_link_created
enrollment_link_consumed
enrollment_link_revoked
passkey_registered
passkey_updated
passkey_revoked
app_login_success
app_login_failed
auth_code_created
auth_code_consumed
session_created
session_revoked
public_key_served
```

---

## Admin Portal Flow

### `GET /admin`

The admin page should show:

1. Centered login panel if not authenticated.
2. List or prompt for available passkeys for this domain.
3. Button to use passkey login.
4. Button to log in with bootstrap password only if `ALLOW_BOOTSTRAP_PW=true`.

The page should not show the bootstrap password form if `ALLOW_BOOTSTRAP_PW=false`.

Only passkeys with `isAdmin=true` may log into the admin portal.

### Admin Login Options

The admin login page should support:

```txt
[Use admin passkey]
[Use bootstrap password] only when ALLOW_BOOTSTRAP_PW=true
```

### Bootstrap Admin Flow

When the user logs in using `BOOTSTRAP_PW` and does not have a passkey-authenticated admin session:

1. Create a short-lived `bootstrap_admin` session.
2. Show a special first-run panel.
3. Offer one-click creation of an admin enrollment link.
4. Provide a button: `Create and open first admin enrollment link`.
5. On click:

   * create enrollment link with `creates_admin_passkey=true`
   * redirect to `/enroll?k=<raw-token>`
6. After successful enrollment, the created passkey has `isAdmin=true`.
7. Guide user back to `/admin`.
8. Prompt user to disable `ALLOW_BOOTSTRAP_PW`.

The app cannot disable the Cloudflare secret directly unless future Cloudflare API integration is added. For now, show instructions to the user.

Example instruction:

```txt
Update your deployment secret:

ALLOW_BOOTSTRAP_PW=false
```

The exact command depends on the Alchemy deployment setup.

### Authenticated Admin View

After admin login, display:

* passkey table
* enrollment link creation panel
* audit summary
* recent auth events

Passkey table columns:

```txt
Label
Email
Admin?
Created
Last used
Apps used
Status
Actions
```

Actions:

```txt
Update email
Update label
Revoke/delete
```

Enrollment link panel:

```txt
Default email
Default label
Admin passkey? checkbox
Expiration
Create enrollment link
```

After creating an enrollment link, show the full URL exactly once.

---

## Login Page UI

### `GET /login`

The login page should be mostly whitespace.

It should display a centered panel.

The panel should contain:

1. App name or app ID.
2. A list/prompt for available passkeys for this domain when browser APIs make that possible.
3. A primary button to authenticate with a passkey.
4. Minimal explanatory text.
5. No password form.

Visual shape:

```txt
 -------------------------------------------------
|                                                 |
|                                                 |
|                 ┌──────────────────────┐        |
|                 │ Sign in              │        |
|                 │                      │        |
|                 │ App: photos          │        |
|                 │                      │        |
|                 │ [Use passkey]        │        |
|                 └──────────────────────┘        |
|                                                 |
|                                                 |
 -------------------------------------------------
```

Note: browsers do not always allow a website to enumerate passkeys in a fully custom list. Build the UI so that the browser-native passkey selector is acceptable. The page can say “Choose one of your passkeys for this domain” and then call the WebAuthn authentication flow.

---

## Enrollment Flow

### Admin Creates Link

From `/admin`, an authenticated admin creates a one-time enrollment link.

Fields:

```txt
defaultEmail
defaultLabel
createsAdminPasskey
expiresAt optional
```

The server generates:

```txt
rawToken = secureRandomBase64Url(32+ bytes)
tokenHash = sha256(rawToken)
```

Store only `tokenHash`.

Return:

```txt
${AUTH_ORIGIN}/enroll?k=${rawToken}
```

Display the raw link exactly once.

### User Opens Link

`GET /enroll?k=<raw-token>`

Server should:

1. Hash the raw token.
2. Check that matching enrollment link exists.
3. Check that it is not expired.
4. Check that it is not consumed.
5. Check that it is not revoked.
6. Render enrollment form.

Form fields:

```txt
email
label
```

Pre-fill from enrollment link defaults if available.

Show whether the passkey will be an admin passkey.

If the link creates an admin passkey, display:

```txt
This enrollment link will create an admin passkey.
```

### User Registers Passkey

Browser calls registration options endpoint.

Server creates WebAuthn registration options.

Browser calls WebAuthn create.

Server verifies registration.

Server stores passkey with:

```ts
isAdmin = enrollmentLink.createsAdminPasskey
```

Server marks enrollment link as consumed.

Server records audit events.

Server redirects to success page.

Success page should offer:

```txt
[Go to admin portal]
```

---

## App Login Flow

Protected app starts at:

```txt
https://private-app.example.com/
```

If no valid app session exists, the app redirects to:

```txt
${AUTH_ORIGIN}/login?app=<appId>&returnTo=<encoded-url>
```

The auth service:

1. Validates `app` against `ALLOWED_APPS`.
2. Validates `returnTo` origin against the configured app origin.
3. Shows passkey login panel.
4. Creates authentication challenge.
5. Browser signs challenge with passkey.
6. Server verifies assertion.
7. Server records audit event:

```txt
event_type = app_login_success
app_id = appId
passkey_id = credential passkey id
email = passkey email
```

8. Server creates short-lived auth code.
9. Server redirects to:

```txt
${returnTo}?code=<auth-code>
```

The protected app then exchanges the code:

```txt
POST ${AUTH_ORIGIN}/api/token/exchange
```

Request body:

```json
{
  "code": "raw-code",
  "appId": "photos"
}
```

Response:

```json
{
  "ok": true,
  "session": "signed-session-token",
  "email": "sam@example.com",
  "passkeyId": "pk_123",
  "isAdmin": false,
  "expiresAt": "2026-06-06T20:00:00.000Z"
}
```

The protected app stores the session in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie for its own domain.

The protected app verifies the session using the auth service public key, not a shared secret.

---

## Asymmetric Session Signing

Do not use `SESSION_SIGNING_SECRET`.

Use asymmetric signing.

The auth service has:

```txt
AUTH_PRIVATE_KEY
```

The auth service exposes the matching public key.

Protected apps verify signed sessions using public key material.

Preferred token format:

```txt
JWT or compact signed token
```

Recommended payload:

```json
{
  "iss": "https://auth.example.com",
  "aud": "photos",
  "sub": "passkey-id",
  "email": "sam@example.com",
  "isAdmin": false,
  "iat": 1780776000,
  "exp": 1780779600
}
```

Validation requirements for protected apps:

* signature is valid
* `iss` equals configured `AUTH_ORIGIN`
* `aud` equals local `appId`
* `exp` is in the future
* passkey revocation is checked when online revocation checking is enabled

For beta, protected apps can fetch the public key from the auth service and cache it.

Later, add key rotation with `kid`.

---

## Client Library Design

Publish a small library from the repo.

Initial exports:

```ts
createDropletAuthClient
requireLogin
handleAuthCallback
verifyAppSession
createAuthRedirect
fetchAuthPublicKey
```

### Browser Helper

```ts
import { createDropletAuthClient } from "@droplet-auth/client/browser";

const auth = createDropletAuthClient({
  authOrigin: "https://auth.example.com",
  appId: "photos"
});

await auth.requireLogin();
```

### Worker Helper

```ts
import { verifyAppSession, createAuthRedirect } from "@droplet-auth/client/worker";

export default {
  async fetch(request, env) {
    const session = await verifyAppSession(request, env, {
      appId: "photos",
      authOrigin: env.AUTH_ORIGIN
    });

    if (!session) {
      return createAuthRedirect(request, {
        appId: "photos",
        authOrigin: env.AUTH_ORIGIN
      });
    }

    return new Response(`Hello ${session.email}`);
  }
};
```

### Protected App Required Config

Each protected app needs:

```txt
AUTH_ORIGIN
APP_ID
```

Protected apps do not need any shared signing secret.

They should verify signed sessions using the auth service public key.

---

## API Routes

### Health

```txt
GET /health
```

Returns:

```json
{
  "ok": true
}
```

---

### Public Key

```txt
GET /.well-known/droplet-auth/jwks.json
```

Returns public key material for verifying signed sessions.

---

### Admin

```txt
GET /admin
POST /api/admin/bootstrap-login
POST /api/admin/logout
POST /api/admin/passkey/options
POST /api/admin/passkey/verify
GET /api/admin/passkeys
PATCH /api/admin/passkeys/:id
DELETE /api/admin/passkeys/:id
POST /api/admin/enrollment-links
GET /api/admin/audit
```

Admin passkey verification must reject non-admin passkeys.

---

### Enrollment

```txt
GET /enroll
POST /api/enroll/options
POST /api/enroll/verify
```

`GET /enroll` requires `k` query param.

If missing, show an error page.

If invalid, expired, consumed, or revoked, show a safe generic error:

```txt
This enrollment link is invalid or has expired.
```

---

### Login

```txt
GET /login
POST /api/login/options
POST /api/login/verify
```

Required query params:

```txt
app
returnTo
```

---

### Token Exchange

```txt
POST /api/token/exchange
```

Consumes an auth code and returns signed app session data.

Auth codes must be one-time use.

---

## Security Requirements

### Secrets

* Never log secret values.
* Never return secret values to the browser.
* Treat `BOOTSTRAP_PW` as sensitive.
* Treat `AUTH_PRIVATE_KEY` as sensitive.
* `ALLOW_BOOTSTRAP_PW` is a secret for operational simplicity, even though it is boolean-like.

### Bootstrap Password

* Only available when `ALLOW_BOOTSTRAP_PW=true`.
* Rate limit attempts.
* Record failed attempts in audit log.
* Use constant-time comparison where practical.
* Successful bootstrap login should create a short-lived `bootstrap_admin` session.
* Bootstrap admin sessions should have limited permissions:

  * create first admin enrollment link
  * view first-run instructions
  * optionally view passkey count
* Avoid allowing full destructive admin actions from bootstrap-only session in beta unless explicitly implemented.

### Admin Access

* Only `isAdmin=true` passkeys can log into the admin portal.
* Non-admin passkeys can log into protected apps only.
* The first passkey created from bootstrap flow must be an admin passkey.
* Admin-created enrollment links must include an `Admin passkey?` checkbox.

### Enrollment Links

* Generate at least 32 bytes of secure randomness.
* Store only a hash of the token.
* Show raw token/link once.
* Mark consumed after successful passkey registration.
* Allow admins to revoke unused links.
* Support optional expiration.
* Store whether the link creates an admin passkey.

### Challenges

* Short-lived.
* Single-use.
* Bound to operation type.
* Bound to relevant context:

  * registration
  * authentication
  * admin authentication
  * app ID
  * enrollment link ID

### Sessions

* Use `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
* Admin sessions should be short-lived.
* App sessions can be configurable but should default to a reasonable duration.
* Revoked passkeys should not be allowed to create new sessions.
* Existing sessions for revoked passkeys should be rejected if checked against server state.
* App session tokens should be asymmetrically signed.
* Protected apps verify signatures using public key material.

### Return URL Safety

Validate `returnTo`.

Use `ALLOWED_APPS` JSON map:

```json
{
  "photos": "https://photos.example.com",
  "huckabuilder": "https://builder.example.com"
}
```

Rules:

* `appId` must exist in `ALLOWED_APPS`.
* `returnTo` origin must match `ALLOWED_APPS[appId]`.
* Reject unknown apps.
* Reject mismatched return origins.

---

## Audit Trail

Track every meaningful auth event.

The admin portal should display:

### Per-Passkey Usage

For each passkey:

```txt
Total logins
Last used
Apps used
Recent app logins
```

### Per-App Usage

For each app ID:

```txt
Total logins
Unique passkeys
Last login
Recent login history
```

### Recent Events

Show a table:

```txt
Time
Event
App
Email
Passkey label
Admin?
IP
User Agent
```

The user specifically wants to see when each passkey was used to log into each app.

Implement this early.

---

## First-Run Flow

Expected lifecycle:

1. User clones repo.
2. User configures `AUTH_ORIGIN`.
3. User configures `ALLOWED_APPS`.
4. User sets Cloudflare secrets:

   * `BOOTSTRAP_PW`
   * `ALLOW_BOOTSTRAP_PW=true`
   * `AUTH_PRIVATE_KEY`
5. User deploys auth service through Alchemy.
6. User opens:

```txt
${AUTH_ORIGIN}/admin
```

7. User logs in with `BOOTSTRAP_PW`.
8. Admin portal detects bootstrap-only session.
9. Portal shows first-run panel:

```txt
You are signed in with the bootstrap password.
Create your first admin passkey, then disable bootstrap password login.
```

10. User clicks:

```txt
Create and open first admin enrollment link
```

11. Server creates enrollment link with:

```ts
createsAdminPasskey: true
```

12. User is redirected to:

```txt
/enroll?k=<token>
```

13. User registers passkey.
14. Stored passkey has:

```ts
isAdmin: true
```

15. User returns to admin portal.
16. User logs in with admin passkey.
17. Portal shows instruction to set:

```txt
ALLOW_BOOTSTRAP_PW=false
```

18. User disables bootstrap password login through the deployment secret mechanism.
19. Future admin access is passkey-only.
20. To add family devices, user logs into admin with admin passkey and creates more enrollment links.
21. If a family member should not access admin, leave `Admin passkey?` unchecked.

---

## UI Requirements

### General Style

* Minimal.
* Clean.
* Mostly whitespace.
* Centered panels for login/enrollment.
* Tables for admin pages.
* No heavy design system required for beta.

### Login Page

Route:

```txt
/login
```

Requirements:

* Mostly whitespace.
* Centered panel.
* App ID or friendly app name visible.
* Passkey login button.
* Browser-native passkey selector is acceptable.

### Admin Page

Route:

```txt
/admin
```

Unauthenticated state:

* Admin passkey login option.
* Bootstrap password option only if allowed.

Bootstrap-only state:

* First-run panel.
* One-click admin enrollment link generation.
* Clear instruction to disable bootstrap password after admin passkey enrollment.

Authenticated admin state:

* Passkey table.
* Enrollment link creation.
* Audit dashboard.
* Recent events.

### Enrollment Page

Route:

```txt
/enroll?k=<token>
```

Requirements:

* Validate token before showing registration form.
* Email field.
* Label field.
* Display whether this will create an admin passkey.
* Register passkey button.
* Success page.

---

## Error Handling

Use safe error messages.

Examples:

```txt
Invalid or expired enrollment link.
Unable to verify passkey.
This passkey has been revoked.
This passkey cannot access the admin portal.
Bootstrap password login is disabled.
Invalid app or return URL.
```

Do not reveal whether a specific credential ID exists.

Do not reveal whether a particular email exists.

---

## README Requirements

The README should include:

1. What the project is.
2. Beta warning.
3. Cloudflare prerequisites.
4. Alchemy v2 setup instructions.
5. Effect v4 beta note.
6. Secret setup instructions.
7. `AUTH_ORIGIN` configuration.
8. `ALLOWED_APPS` JSON map configuration.
9. First-run flow.
10. How to protect an app.
11. How to create enrollment links.
12. Difference between admin and non-admin passkeys.
13. How to recover if all admin passkeys are lost.
14. Public key / asymmetric signing model.
15. Security limitations.
16. Known beta limitations.

### Example Secret Setup

The exact commands should match the Alchemy v2 deployment setup.

Document the expected values:

```txt
BOOTSTRAP_PW=<strong password>
ALLOW_BOOTSTRAP_PW=true
AUTH_PRIVATE_KEY=<generated private signing key>
```

After first admin passkey is enrolled, the user should update:

```txt
ALLOW_BOOTSTRAP_PW=false
```

---

## Implementation Milestones

### Milestone 1 — Project Skeleton

* Create Worker TypeScript project.
* Add Alchemy v2 stack.
* Add Effect v4 beta dependency.
* Add Durable Object class.
* Add SQLite migrations/init.
* Add `/health`.
* Add env validation.
* Add `AUTH_ORIGIN` parsing.
* Add `ALLOWED_APPS` JSON parsing.
* Add basic HTML layout helpers.

Acceptance criteria:

* Alchemy stack can deploy or locally orchestrate the Worker.
* `/health` returns `{ ok: true }`.
* Durable Object initializes schema.
* `ALLOWED_APPS` invalid JSON fails loudly.

---

### Milestone 2 — Vendored Source

* Create `vendor/`.
* Add Alchemy source as git subtree.
* Add Effect source as git subtree.
* Update AGENT.md to require source inspection.
* Add README note explaining vendor purpose.

Acceptance criteria:

* `vendor/alchemy` exists.
* `vendor/effect` exists.
* Agent instructions explicitly tell agents to inspect these sources.

---

### Milestone 3 — ES256 Asymmetric Signing

* Add private key loading from `AUTH_PRIVATE_KEY`.
* Add public key derivation or configured public key handling.
* Add JWKS/public key endpoint.
* Add signed token creation.
* Add signed token verification in client library.
* Use ECDSA P-256 with SHA-256 (`ES256`) and JOSE-compatible JWT/JWKS encoding.

Acceptance criteria:

* Auth service signs app sessions with private key.
* Protected app verifies with public key.
* No shared session secret is required.
* JWKS exposes `kty: "EC"`, `crv: "P-256"`, `alg: "ES256"`, `x`, `y`, and `kid`.

---

### Milestone 4 — Admin Bootstrap Login

* Add `/admin`.
* Add `BOOTSTRAP_PW` login when `ALLOW_BOOTSTRAP_PW=true`.
* Add rate limiting for failed bootstrap attempts.
* Add bootstrap admin session cookie.
* Add audit events for success/failure.

Acceptance criteria:

* Admin page shows bootstrap login only when enabled.
* Correct password creates bootstrap admin session.
* Incorrect password is rejected and audited.
* Bootstrap login is unavailable when disabled.

---

### Milestone 5 — Enrollment Link System

* Add enrollment link creation from bootstrap admin session.
* First-run bootstrap flow must create admin enrollment links only.
* Admin UI includes `Admin passkey?` checkbox for normal enrollment creation.
* Generate high-entropy raw token.
* Store token hash only.
* Display enrollment link once.
* Add validation for `/enroll?k=...`.
* Add revoked/consumed/expired handling.

Acceptance criteria:

* Bootstrap admin can create first admin enrollment link.
* Authenticated admin can create admin or non-admin enrollment links.
* Raw token is not stored.
* Invalid links are rejected.
* Consumed links cannot be reused.

---

### Milestone 6 — Passkey Registration

* Add SimpleWebAuthn registration options endpoint.
* Add registration verification endpoint.
* Store passkey public key and metadata.
* Store `isAdmin` from enrollment link.
* Consume enrollment link after successful registration.
* Add success page.
* Add audit events.

Acceptance criteria:

* User can register a passkey from a valid enrollment link.
* Passkey is stored with email, label, and `isAdmin`.
* First bootstrap-created passkey is admin.
* Enrollment link is consumed.
* Registration is audited.

---

### Milestone 7 — Admin Passkey Login

* Add admin passkey authentication options endpoint.
* Add admin passkey verification endpoint.
* Reject non-admin passkeys for admin login.
* Create admin session after successful admin passkey login.
* Show authenticated admin dashboard.
* Show passkeys table.

Acceptance criteria:

* Admin can log in using registered admin passkey.
* Non-admin passkey cannot access admin portal.
* Admin can see passkeys.
* Admin can log out.
* Admin login is audited.

---

### Milestone 8 — Passkey Management

* Update passkey email.
* Update passkey label.
* Revoke/delete passkey.
* Show admin status.
* Show last-used data.
* Show app usage data.

Acceptance criteria:

* Admin can update email.
* Admin can update label.
* Admin can revoke a passkey.
* Revoked passkey cannot log in.
* Admin status is visible.

---

### Milestone 9 — App Login Flow

* Add `/login?app=&returnTo=`.
* Validate `app` and `returnTo` against `ALLOWED_APPS`.
* Add passkey authentication for app login.
* Create one-time auth code.
* Redirect back to protected app.
* Add `/api/token/exchange`.
* Return asymmetrically signed app session.

Acceptance criteria:

* Protected app can redirect to auth service.
* User logs in with passkey.
* Auth service redirects back with code.
* Protected app exchanges code for signed session.
* Protected app verifies session using public key.
* App login is audited with `appId`.

---

### Milestone 10 — Client Library

* Add browser helper.
* Add Worker helper.
* Add public key fetch/cache helper.
* Add example protected Worker app.
* Document usage.

Acceptance criteria:

* Example app can be protected with minimal code.
* Missing session redirects to auth service.
* Callback code exchange works.
* Valid signed session allows access.
* No shared secret is configured in protected app.

---

### Milestone 11 — Audit Dashboard

* Add audit query endpoints.
* Add recent events table.
* Add per-passkey app usage summary.
* Add per-app usage summary.

Acceptance criteria:

* Admin can see which passkey logged into which app.
* Admin can see whether passkeys are admin passkeys.
* Admin can see recent logins.
* Admin can see failed bootstrap attempts.
* Admin can see enrollment events.

---

### Milestone 12 — Documentation and Beta Hardening

* Finish README.
* Finish AGENT.md.
* Add security notes.
* Add recovery instructions.
* Add beta warning.
* Add tests for critical flows.

Acceptance criteria:

* New user can deploy from README using Alchemy.
* New user can enroll first admin passkey.
* New user can protect example app.
* Recovery flow is documented.
* Beta limitations are documented.

---

## Testing Plan

### Unit Tests

* token generation
* token hashing
* asymmetric signing
* signature verification
* public key/JWKS serialization
* app return URL validation
* `ALLOWED_APPS` parsing
* bootstrap password comparison
* audit event creation

### Durable Object Tests

* schema initialization
* passkey insert/update/revoke
* admin passkey flag behavior
* enrollment link create/consume
* enrollment link admin flag behavior
* challenge create/consume
* auth code create/consume
* audit event queries

### Integration Tests

* bootstrap login
* first admin enrollment link generation
* passkey registration flow with mocked WebAuthn verification
* admin login flow with mocked WebAuthn verification
* non-admin passkey rejected from admin portal
* app login flow
* token exchange flow
* signed session verification
* revoked passkey blocked

### Manual Browser Tests

* enroll admin passkey on Mac Chrome
* enroll non-admin passkey on Mac Chrome
* enroll passkey on iPhone Safari
* enroll passkey on Android Chrome
* admin login with admin passkey
* verify non-admin passkey cannot access admin
* app login with passkey
* disable bootstrap password and verify password login disappears
* re-enable bootstrap password and verify recovery works

---

## Important Implementation Notes

### WebAuthn RP ID

The RP ID should correspond to the auth service domain.

If `AUTH_ORIGIN` is:

```txt
https://auth.example.com
```

then RP ID is typically:

```txt
auth.example.com
```

Derive this safely using:

```ts
new URL(env.AUTH_ORIGIN).hostname
```

### Browser Passkey List

Do not assume the app can render a fully accurate custom list of all passkeys available on the device.

Use browser-native WebAuthn/passkey prompts.

The UI can describe the intent as “Choose one of your passkeys for this domain.”

### Configurable Origin

Every place that builds a URL must use `env.AUTH_ORIGIN`.

### Effect v4 Beta

Use Effect v4 beta for application structure where it improves clarity:

* env parsing
* typed errors
* service boundaries
* Durable Object service wrapper
* crypto service wrapper
* WebAuthn service wrapper
* audit service
* route composition if practical

Do not turn simple route handlers into overly abstract Effect machinery just to use Effect.

Use Effect where it makes correctness, testability, and dependency management better.

### Alchemy v2

Use Alchemy v2 for orchestration.

Do not make Wrangler the source of truth for deployment config.

When uncertain about the Alchemy API, inspect:

```txt
vendor/alchemy
```

before guessing.

### Vendored Source

When uncertain about Effect APIs, inspect:

```txt
vendor/effect
```

before guessing.

### Beta Compatibility

Do not add migration complexity for hypothetical future versions unless needed.

Breaking schema/API/client changes are acceptable during beta.

Prefer simple, correct, shippable implementation over compatibility layers.

---

## Open Questions for Later

* Should app sessions be online-verified with the auth service every request?
* Should JWKS key rotation be added before exiting beta?
* Should enrollment links support expiration presets?
* Should the admin portal allow converting a non-admin passkey into an admin passkey?
* Should admins be able to remove their own final admin passkey?
* Should passkeys have per-app allow/deny rules?

For the beta, `isAdmin` exists from version one, and only admin passkeys can access the admin portal.
