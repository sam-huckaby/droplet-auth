# AGENT.md — droplet-chat

## Project Status

This project is in beta.

Breaking changes are acceptable.

Do not preserve backward compatibility unless explicitly instructed.

Prefer simple, clean, correct implementation over compatibility layers, migrations, or abstractions designed only for future unknown versions.

---

## Project Purpose

This repo implements **droplet-chat**, a reusable, standalone, real-time project chat room for Cloudflare Workers.

It is intended to be deployed once per project.

It should be useful for both:

* humans working together on a project
* agents coordinating work on a project

The app is roughly equivalent to a single Slack channel with threads.

It is not a Slack workspace clone.

The related passkey auth server is called **droplet-auth**.

---

## Hard Requirements

* Project name is `droplet-chat`.
* Optional human UI auth integrates with `droplet-auth`.
* Human UI auth is enabled only when both `AUTH_ORIGIN` and `APP_ID` are set.
* If `AUTH_ORIGIN` and `APP_ID` are not both set, the human UI is completely unprotected.
* When droplet-auth is used, verify sessions through a Worker service binding.
* The droplet-auth service binding should be named `DROPLET_AUTH`.
* If human UI auth is enabled and `DROPLET_AUTH` is missing, fail loudly.
* Agent API always requires `AGENT_API_KEY`.
* Add a Bun helper script to generate a cryptographically random API key.
* Default `MAX_UPLOAD_BYTES` is `1073741824`, which is 1 GiB.
* `MAX_UPLOAD_BYTES` must be configurable through `.env`.
* Single room/channel only.
* Top-level messages are allowed.
* Threads are allowed under top-level messages.
* Threads cannot exist inside threads.
* All members can see all content.
* No granular permissions inside the room.
* Human UI must support real-time chat.
* Agent API must support fetching new messages/events after a timestamp.
* File uploads must be supported.
* Use Cloudflare Workers.
* Use Durable Objects for room coordination.
* Use SQLite-backed Durable Object storage for metadata.
* Use R2 for file bytes.
* Use WebSockets for real-time updates.
* Use WebSocket hibernation where possible.
* Use Alchemy v2 for orchestration.
* Use Effect v4 beta where it improves clarity.
* Do not vendor Alchemy or Effect source in the first pass.
* Do not add task-level endpoints in the first pass.
* Do not add task claim, release, or done endpoints.
* Do not add task claim storage/schema.
* Task/project-management interoperability can be added later.

---

## Architecture Rules

The outer Worker should handle:

* routing
* authentication
* request validation
* R2 file upload/download
* serving human UI
* forwarding stateful operations to the Durable Object
* verifying droplet-auth sessions when configured

The Durable Object should handle:

* message storage
* thread storage
* event storage
* WebSocket connection coordination
* broadcasting events
* enforcing no nested threads
* serializing writes

R2 should handle:

* file bytes only

SQLite-backed Durable Object storage should handle:

* message metadata
* reply metadata
* attachment metadata
* event log

Do not add task storage in the first pass.

---

## Authentication Rules

### Human UI

Human UI auth is optional.

Use this rule:

```ts
const humanAuthEnabled = Boolean(env.AUTH_ORIGIN && env.APP_ID);
```

If `humanAuthEnabled` is true:

* require valid droplet-auth session before serving the UI
* redirect unauthenticated humans through droplet-auth
* derive human identity from droplet-auth session
* verify droplet-auth sessions through `env.DROPLET_AUTH`
* fail loudly if `env.DROPLET_AUTH` is unavailable

If `humanAuthEnabled` is false:

* serve the UI without authentication
* allow the browser client to use a local display name
* do not block UI routes

### droplet-auth Service Binding

Use a Worker service binding for droplet-auth.

Binding name:

```txt
DROPLET_AUTH
```

Runtime type:

```ts
type Env = {
  DROPLET_AUTH?: Fetcher;
};
```

Use `AUTH_ORIGIN` for browser redirects.

Use `DROPLET_AUTH` for server-to-server verification.

Do not rely on public HTTP requests from droplet-chat back to droplet-auth for verification.

### Agent API

Agent API always uses:

```txt
Authorization: Bearer <AGENT_API_KEY>
```

Do not require WebAuthn for agents.

Do not allow unauthenticated agent API access.

Even when the UI is unprotected, agent API routes must still require `AGENT_API_KEY`.

In the first pass, `AGENT_API_KEY` is an environment variable/secret.

Later, agent API keys may be generated in droplet-auth.

Do not build droplet-auth-generated API key support yet.

---

## API Key Script Requirement

Add:

```txt
scripts/generate-api-key.ts
```

Add package script:

```json
{
  "scripts": {
    "generate:api-key": "bun run scripts/generate-api-key.ts"
  }
}
```

The script must:

* use cryptographically secure randomness
* generate at least 32 random bytes
* output a URL-safe key
* print clear instructions for setting `AGENT_API_KEY`

Example output:

```txt
Generated AGENT_API_KEY:

droplet_agent_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Set this as your AGENT_API_KEY secret/environment variable.
```

A prefix like `droplet_agent_` is preferred because it makes leaked keys easier to identify.

---

## Upload Size Rules

Default max upload size:

```txt
1073741824
```

That is 1 GiB.

The value must be configurable through `.env`:

```env
MAX_UPLOAD_BYTES="1073741824"
```

Implementation expectations:

* parse `MAX_UPLOAD_BYTES` as a number
* default to `1073741824` when missing
* reject malformed values
* reject values less than or equal to zero
* reject uploads larger than the configured value
* return `payload_too_large` for oversized uploads

---

## Agent API Requirements

Agents must be able to:

* post top-level messages
* post thread replies
* fetch events after timestamp
* upload files
* download files

The most important endpoint is:

```txt
GET /api/events?after=<iso-timestamp>
```

This lets agents fetch only new events instead of re-reading the whole channel.

Always include server time in event responses so agents can maintain a reliable cursor.

Do not add task-claim endpoints in this project.

---

## Thread Rules

Valid:

```txt
message -> reply
```

Invalid:

```txt
message -> reply -> reply
```

A reply cannot be used as a parent.

If a client tries to create a nested thread, return:

```json
{
  "ok": false,
  "error": {
    "code": "thread_nesting_not_allowed",
    "message": "Threads cannot be created inside threads."
  }
}
```

---

## File Rules

* Store file bytes in R2.
* Store metadata in Durable Object SQLite.
* Enforce `MAX_UPLOAD_BYTES`.
* Default max upload size is 1 GiB.
* Serve downloads with safe headers.
* Do not trust user-provided content type for security.
* Do not expose internal R2 keys unless intentionally designed.

---

## Realtime Rules

* Use WebSocket hibernation where possible.
* Use WebSocket primarily for receiving events.
* Use HTTP POST for writes in the first beta.
* Every successful write should create an event.
* Every event should be broadcast to connected clients.
* Browser clients should reconnect automatically.

---

## Effect Instructions

Use Effect v4 beta where it makes the implementation clearer or safer.

Good uses of Effect:

* environment parsing
* typed errors
* services
* validation
* R2 wrapper
* Durable Object client wrapper
* API key verification
* droplet-auth session verification

Do not over-abstract simple route handlers merely to use Effect.

---

## Alchemy Instructions

Use Alchemy v2 for orchestration.

Do not make Wrangler the primary source of truth.

Confirm exact Alchemy APIs during implementation.

Do not invent Alchemy APIs from memory if docs or installed types disagree.

The Alchemy stack must support:

* Worker
* Durable Object
* R2 bucket
* `AGENT_API_KEY`
* `MAX_UPLOAD_BYTES`
* optional `AUTH_ORIGIN`
* optional `APP_ID`
* optional `DROPLET_AUTH` service binding

---

## Coding Style

Use TypeScript.

Use Bun for scripts and local tooling.

Favor small modules.

Keep route handlers thin.

Keep Durable Object logic explicit.

Use simple SQL.

Avoid unnecessary abstractions.

Avoid adding complex auth/permissions systems in beta.

Do not add task/project-management features in beta.

Escape user-generated HTML.

Validate JSON request bodies.

Return consistent JSON errors.

---

## Required Tests

Add or update tests for:

* env parsing
* human auth mode detection
* missing `DROPLET_AUTH` binding when auth enabled
* `MAX_UPLOAD_BYTES` default
* malformed `MAX_UPLOAD_BYTES`
* oversized upload rejection
* API key generation shape
* API key auth
* message creation
* message listing
* event listing after timestamp
* thread reply creation
* nested thread rejection
* attachment metadata

Do not add task-claim tests because task endpoints should not exist in the first pass.

---

## Beta Biases

When choosing between two reasonable approaches:

* prefer simple over clever
* prefer explicit over magical
* prefer shippable over comprehensive
* prefer single-room assumptions
* prefer chat-specific features only
* prefer HTTP writes plus WebSocket reads
* prefer one deployment per project
* prefer breaking changes over compatibility layers

