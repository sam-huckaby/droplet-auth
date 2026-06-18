# PLAN.md — droplet-chat

## Project Summary

Build **droplet-chat**, a reusable, standalone, easily deployable real-time chat room for Cloudflare Workers.

The app is roughly equivalent to one Slack channel, not a Slack workspace.

It supports:

* one main channel
* top-level messages
* one level of threads under top-level messages
* no nested threads
* no granular internal permissions
* real-time browser UI
* agent-friendly API
* file uploads
* message history
* polling/fetching new messages after a timestamp
* project-scoped deployment to a unique Cloudflare Worker URL
* optional human UI auth through **droplet-auth**
* mandatory API-key auth for agents

The target use case is spinning up a communication space for each new project so humans and agents can coordinate without creating a Discord server, Slack workspace, or ad-hoc communication mess.

Example deployment:

```txt
https://project-chat.samhuckaby.workers.dev
https://my-new-project-chat.example.com
```

---

## Product Goals

### Primary Goals

* Make it easy to deploy one chat room per project.
* Let humans communicate through a simple real-time web UI.
* Let agents communicate through simple HTTP APIs.
* Let agents check for new messages/events without re-fetching the entire channel.
* Let humans and agents share files.
* Keep all members able to see all content.
* Avoid Slack/Discord-level complexity.
* Keep the system small, understandable, and cheap to run on Cloudflare.
* Allow optional protection of the human UI using **droplet-auth**.
* Use a Worker service binding when talking to droplet-auth.
* Always require agents to authenticate with an API key.

### Non-Goals for Initial Beta

* Multiple channels.
* Private channels.
* Direct messages.
* Granular permissions.
* Complex role hierarchy.
* Full Slack clone.
* Search indexing beyond basic database queries.
* Rich markdown editor.
* Emoji reactions.
* Voice/video.
* End-to-end encryption.
* Federated chat.
* Multi-tenant hosted SaaS.
* Agent API key generation through droplet-auth in the first pass.
* Task claiming.
* Project management.
* Issue tracking.
* Task-level coordination endpoints.

Task claiming and project management belong in a separate app. droplet-chat should remain chat-specific. Task/project-management interoperability can be added later.

---

## Core Mental Model

There is exactly one room.

The room contains top-level messages.

A top-level message may have replies.

Replies are the thread.

Replies cannot themselves have replies.

```txt
Room
├── Message A
│   ├── Reply A1
│   └── Reply A2
├── Message B
└── Message C
    └── Reply C1
```

Every member can read everything.

Every agent can read everything if it has API-key access.

---

## Project Name

The project is called:

```txt
droplet-chat
```

The related passkey-based auth project is called:

```txt
droplet-auth
```

When this plan mentions optional human auth, it refers to integration with **droplet-auth**.

---

## Stack

```txt
Runtime: Cloudflare Workers
Realtime coordination: Durable Object
Realtime transport: WebSocket Hibernation API
Message metadata/storage: SQLite-backed Durable Object storage
File storage: Cloudflare R2
Orchestration: Alchemy v2
Application structure: Effect v4 beta
Language: TypeScript
Runtime/tooling: Bun
Router: Hono or Effect-native HTTP if practical
Human UI: server-rendered HTML + small browser client
Agent API: JSON HTTP endpoints
Testing: Vitest, Bun test, or Effect-native tests
```

---

## Deployment Philosophy

Each project gets its own deployment.

The deployed app is not a multi-tenant service.

Example:

```txt
Project A -> project-a-chat.example.com
Project B -> project-b-chat.example.com
Project C -> project-c-chat.example.com
```

Each deployment has its own:

* Worker
* Durable Object namespace
* R2 bucket
* secrets
* room data
* attachments

This keeps the app operationally simple and makes it easy to destroy after the project ends.

---

## Orchestration

Use Alchemy v2 for orchestration.

Do not make Wrangler the primary source of deployment truth.

Suggested orchestration file:

```txt
alchemy.run.ts
```

The Alchemy stack should create/bind:

* Worker
* Durable Object namespace
* R2 bucket
* required secrets
* required vars
* optional custom domain/route
* optional service binding to droplet-auth

---

## Effect v4 Beta

Use Effect v4 beta where it improves correctness and organization.

Good places for Effect:

* environment parsing
* typed errors
* service boundaries
* auth/API key verification
* droplet-auth session verification
* message service
* file service
* audit/logging service
* Durable Object client wrapper
* R2 wrapper
* route composition if practical

Do not overcomplicate simple route handlers just to force Effect everywhere.

---

## Vendored Source

Do not vendor Alchemy or Effect source in the first pass.

Vendoring may be added later.

For now, keep the repository focused on the app implementation.

---

## Configuration

### Required Vars

```txt
ROOM_NAME
PUBLIC_ORIGIN
MAX_UPLOAD_BYTES
```

### Optional Vars

```txt
ROOM_DESCRIPTION
DEFAULT_TIMEZONE
AUTH_ORIGIN
APP_ID
```

### Required Secrets

```txt
AGENT_API_KEY
```

### Optional Bindings

```txt
DROPLET_AUTH
```

`DROPLET_AUTH` is a Worker service binding to the deployed droplet-auth Worker.

Use this binding when optional human UI auth is enabled.

---

## `.env` Configuration

Use `.env` for local/deployment configuration consumed by the Alchemy stack.

Example:

```env
ROOM_NAME="droplet-chat"
ROOM_DESCRIPTION="Project communication room"
PUBLIC_ORIGIN="https://project-chat.example.com"

# Default is 1GB, but this is configurable.
MAX_UPLOAD_BYTES="1073741824"

# Optional droplet-auth integration.
AUTH_ORIGIN="https://auth.example.com"
APP_ID="project-chat"

# Required for agent API access.
AGENT_API_KEY="droplet_agent_replace_me"
```

Default `MAX_UPLOAD_BYTES`:

```txt
1073741824
```

That is 1 GiB.

If `MAX_UPLOAD_BYTES` is not set, the app should default to `1073741824`.

---

## Optional Human UI Auth

Human UI auth is optional.

The rule is simple:

```txt
If AUTH_ORIGIN and APP_ID are both set:
  require login through droplet-auth before viewing the UI.

If AUTH_ORIGIN and APP_ID are not both set:
  the UI is completely unprotected.
```

### Important Service Binding Requirement

When droplet-auth is used, droplet-chat should connect to droplet-auth through a Worker service binding.

Do not rely only on public HTTP requests from droplet-chat to droplet-auth.

Reason: Cloudflare may block or interfere with requests that route from one Worker back through another public Cloudflare route. The service binding keeps Worker-to-Worker communication internal and reliable.

Suggested binding name:

```txt
DROPLET_AUTH
```

Runtime env shape:

```ts
type Env = {
  DROPLET_AUTH?: Fetcher;
};
```

When verifying a droplet-auth session, use:

```ts
env.DROPLET_AUTH.fetch(request)
```

or construct a new internal verification request and send it through the binding.

`AUTH_ORIGIN` is still needed for browser redirects, but server-side verification should prefer the service binding.

### Protected UI Mode

When both are configured:

```txt
AUTH_ORIGIN=https://auth.example.com
APP_ID=my-project-chat
```

droplet-chat should require a valid droplet-auth session before serving the human UI.

Protected routes include:

```txt
GET /
GET /threads/:messageId
GET /attachments/:attachmentId
GET /ws
```

The user should be redirected through droplet-auth when not authenticated.

Server-side session verification should happen through the `DROPLET_AUTH` service binding.

### Unprotected UI Mode

When either value is missing:

```txt
AUTH_ORIGIN is missing
```

or:

```txt
APP_ID is missing
```

the human UI should be completely unprotected.

This is useful for:

* local development
* quick private experiments
* deployments where the URL itself is already protected
* early beta testing

### Important Auth Boundary

Human UI auth and agent API auth are separate.

Even if the UI is unprotected, the agent API must still require `AGENT_API_KEY`.

---

## Agent API Authentication

Agents must always authenticate with an API key.

Header:

```txt
Authorization: Bearer <AGENT_API_KEY>
```

The first beta uses a single environment-provided API key.

Later, API keys can be generated and managed by **droplet-auth**.

### Required Secret

```txt
AGENT_API_KEY
```

### Behavior

* Missing API key: reject.
* Incorrect API key: reject.
* UI auth configuration does not affect agent API auth.
* Agents do not use WebAuthn.
* Agents do not use droplet-auth in the first pass.

### Future Direction

Later versions may replace the static `AGENT_API_KEY` with API keys generated by droplet-auth.

Do not build that integration in the first pass.

---

## API Key Generation Script

Add a helper Bun script that generates a cryptographically random API key for the user.

Suggested file:

```txt
scripts/generate-api-key.ts
```

Suggested package script:

```json
{
  "scripts": {
    "generate:api-key": "bun run scripts/generate-api-key.ts"
  }
}
```

Suggested implementation:

```ts
const bytes = new Uint8Array(32);
crypto.getRandomValues(bytes);

const encoded = btoa(String.fromCharCode(...bytes))
  .replaceAll("+", "-")
  .replaceAll("/", "_")
  .replaceAll("=", "");

console.log(`Generated AGENT_API_KEY:\n`);
console.log(`droplet_agent_${encoded}`);
console.log(`\nSet this as your AGENT_API_KEY secret/environment variable.`);
```

The generated key should be high-entropy and URL-safe.

---

## Core Entities

### Message

A top-level message in the room.

```ts
type Message = {
  id: string;
  kind: "message";
  body: string;
  authorId: string;
  authorType: "human" | "agent" | "system";
  authorName: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  attachmentIds: string[];
};
```

### Thread Reply

A reply under a top-level message.

```ts
type ThreadReply = {
  id: string;
  kind: "reply";
  parentMessageId: string;
  body: string;
  authorId: string;
  authorType: "human" | "agent" | "system";
  authorName: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  attachmentIds: string[];
};
```

Rules:

* `parentMessageId` must point to a top-level message.
* Replies cannot have replies.
* A reply cannot be used as a parent.

### Attachment

```ts
type Attachment = {
  id: string;
  messageId: string | null;
  replyId: string | null;
  r2Key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedByType: "human" | "agent";
  createdAt: string;
  deletedAt: string | null;
};
```

No task-claim entity should be included in the first pass.

---

## Durable Object Design

Use one singleton Durable Object for the room.

Suggested binding:

```txt
ROOM
```

Suggested class:

```txt
ChatRoom
```

Suggested ID strategy:

```ts
const id = env.ROOM.idFromName("global");
const stub = env.ROOM.get(id);
```

The Durable Object owns:

* WebSocket connections
* message inserts
* thread inserts
* message history
* attachment metadata
* event broadcasting
* cursor/timestamp queries

The Durable Object should not own task claims in the first pass.

---

## Storage Design

Use SQLite-backed Durable Object storage for room metadata.

Use R2 for file bytes.

The Durable Object stores:

* messages
* thread replies
* attachment metadata
* event log

R2 stores:

* uploaded files

---

## Database Schema

### `messages`

```sql
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_type TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at
ON messages (created_at);
```

### `thread_replies`

```sql
CREATE TABLE IF NOT EXISTS thread_replies (
  id TEXT PRIMARY KEY,
  parent_message_id TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_type TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (parent_message_id) REFERENCES messages(id)
);

CREATE INDEX IF NOT EXISTS idx_thread_replies_parent
ON thread_replies (parent_message_id);

CREATE INDEX IF NOT EXISTS idx_thread_replies_created_at
ON thread_replies (created_at);
```

### `attachments`

```sql
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  reply_id TEXT,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by_id TEXT NOT NULL,
  uploaded_by_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (message_id) REFERENCES messages(id),
  FOREIGN KEY (reply_id) REFERENCES thread_replies(id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_message
ON attachments (message_id);

CREATE INDEX IF NOT EXISTS idx_attachments_reply
ON attachments (reply_id);
```

### `events`

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_created_at
ON events (created_at);
```

The `events` table is the canonical agent sync stream.

---

## Event Types

```txt
message.created
message.updated
message.deleted
reply.created
reply.updated
reply.deleted
attachment.created
attachment.deleted
system.notice
```

Every write should produce an event.

WebSocket clients receive events.

Agent polling can query events after a timestamp.

---

## Realtime Transport

Use WebSockets.

Route:

```txt
GET /ws
```

The browser UI connects to:

```ts
const ws = new WebSocket(`${origin.replace("http", "ws")}/ws`);
```

The Durable Object accepts WebSocket connections and broadcasts events.

Use WebSocket hibernation so idle rooms do not stay expensive.

### WebSocket Messages From Server

```json
{
  "type": "message.created",
  "eventId": "evt_123",
  "createdAt": "2026-06-08T18:20:00.000Z",
  "payload": {
    "id": "msg_123",
    "body": "I am looking at the auth cleanup.",
    "authorName": "Sam"
  }
}
```

### WebSocket Write Strategy

Initial beta should prefer:

* WebSocket for receiving events
* HTTP for creating messages/replies/uploads

This keeps write validation simpler.

---

## Human UI

### `GET /`

Main chat room UI.

Layout:

```txt
 -------------------------------------------------
| droplet-chat                                   |
|-------------------------------------------------|
| Message list                                    |
|                                                 |
| Sam: I am looking at the login flow             |
|   [Open thread: 2 replies]                      |
|                                                 |
| agent-a: I found the reconnect bug              |
|                                                 |
|-------------------------------------------------|
| Attach file | Type message...        [Send]     |
 -------------------------------------------------
```

### Required UI Features

* load recent messages
* send top-level message
* receive new messages in real time
* open thread panel under top-level message
* send reply in thread
* upload file with message
* upload file with thread reply
* show attachment links
* show author name
* show timestamp
* show agent vs human indicator
* reconnect WebSocket if disconnected

### Thread UI

Threads should appear as a side panel or inline expanded panel.

Rules:

* only top-level messages can open a thread
* replies cannot open threads
* thread replies are visible to everyone

### File Upload UI

The user should be able to:

* choose a file
* upload it with a message
* upload it with a thread reply
* click a file link to download

For beta, file previews are optional.

---

## Agent API

All agent endpoints require:

```txt
Authorization: Bearer <AGENT_API_KEY>
```

### Health

```txt
GET /api/health
```

Response:

```json
{
  "ok": true
}
```

---

### Get Room Info

```txt
GET /api/room
```

Response:

```json
{
  "roomName": "droplet-chat",
  "description": "Chat for my current project",
  "serverTime": "2026-06-08T18:20:00.000Z"
}
```

---

### List Messages

```txt
GET /api/messages?limit=50
```

Returns recent top-level messages.

---

### List Events After Timestamp

This is the key agent endpoint.

```txt
GET /api/events?after=2026-01-01T16:32:00.000Z
```

Response:

```json
{
  "serverTime": "2026-06-08T18:20:10.000Z",
  "events": [
    {
      "id": "evt_123",
      "type": "message.created",
      "createdAt": "2026-06-08T18:20:00.000Z",
      "payload": {
        "id": "msg_123",
        "body": "I found the reconnect bug.",
        "authorName": "agent-a",
        "authorType": "agent"
      }
    }
  ]
}
```

Agents should store `serverTime` or the latest event timestamp and use it on the next request.

---

### Create Message

```txt
POST /api/messages
```

Request:

```json
{
  "body": "I found the websocket reconnect bug.",
  "authorName": "agent-a",
  "authorId": "agent-a"
}
```

Response:

```json
{
  "ok": true,
  "message": {
    "id": "msg_123",
    "createdAt": "2026-06-08T18:20:00.000Z"
  }
}
```

---

### Create Thread Reply

```txt
POST /api/messages/:messageId/replies
```

Request:

```json
{
  "body": "I saw the same issue. It looks like the client is reconnecting twice.",
  "authorName": "agent-b",
  "authorId": "agent-b"
}
```

Rules:

* `messageId` must be a top-level message.
* Cannot reply to a reply.
* All replies are visible to everyone.

---

### Get Thread

```txt
GET /api/messages/:messageId/replies
```

---

### Upload File

```txt
POST /api/attachments
Content-Type: multipart/form-data
```

Fields:

```txt
file
messageId optional
replyId optional
authorName
authorId
```

Rules:

* attachment may be associated with a message or reply
* for standalone upload, create a system/message event
* enforce `MAX_UPLOAD_BYTES`
* default max is 1 GiB
* store file bytes in R2
* store metadata in Durable Object SQLite

---

### Download File

```txt
GET /api/attachments/:attachmentId/download
```

Returns the file stream from R2.

---

## Cursor Strategy

Agents asked for:

```txt
after January 1st at 4:32pm
```

Support ISO timestamps as the primary API format:

```txt
2026-01-01T16:32:00.000Z
```

Recommended API:

```txt
GET /api/events?after=2026-01-01T16:32:00.000Z
```

Response includes:

```json
{
  "serverTime": "2026-06-08T18:20:10.000Z"
}
```

Agents should use returned `serverTime` as their next checkpoint.

This avoids relying on local machine clock accuracy.

---

## File Storage

Use R2 for file bytes.

Suggested R2 key format:

```txt
attachments/YYYY/MM/DD/<attachment-id>/<safe-filename>
```

Example:

```txt
attachments/2026/06/08/att_123/notes.md
```

Store only metadata in SQLite.

### Upload Limits

Use configurable limit:

```txt
MAX_UPLOAD_BYTES
```

Default:

```txt
1073741824
```

That is 1 GiB.

`MAX_UPLOAD_BYTES` should be set in `.env`.

Example:

```env
MAX_UPLOAD_BYTES="1073741824"
```

### Content Types

Store the browser/client-provided content type, but do not trust it for security decisions.

Serve downloads with safe headers:

```txt
Content-Disposition: attachment; filename="..."
X-Content-Type-Options: nosniff
```

---

## Human/Agent Identity

For beta, keep identity lightweight.

### Human With droplet-auth

If `AUTH_ORIGIN` and `APP_ID` are set, derive identity from droplet-auth session:

```ts
authorType = "human";
authorId = session.sub;
authorName = session.email;
```

Server-side session verification should use the `DROPLET_AUTH` service binding.

### Human Without Auth

If `AUTH_ORIGIN` and `APP_ID` are not both set:

* allow the user to type a display name
* store display name in local storage
* mark messages as human-authless or human-local if useful

Suggested:

```ts
authorType = "human";
authorId = "local-" + localStorage client ID;
authorName = localStorage display name;
```

### Agent

Agents provide:

```json
{
  "authorId": "agent-a",
  "authorName": "Agent A"
}
```

The API key proves they are allowed to post.

Do not try to build per-agent identity security in the first beta.

---

## Message Formatting

Initial beta supports plain text.

Allow basic markdown display later.

For beta:

* escape HTML
* preserve line breaks
* auto-link URLs if easy
* do not render arbitrary HTML

---

## API Response Shape

Use consistent JSON.

### Success

```json
{
  "ok": true,
  "data": {}
}
```

### Error

```json
{
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Human-readable message."
  }
}
```

Recommended error codes:

```txt
unauthorized
forbidden
invalid_request
not_found
payload_too_large
thread_nesting_not_allowed
internal_error
```

---

## Routes

### Human UI

```txt
GET /
GET /threads/:messageId
GET /attachments/:attachmentId
GET /ws
```

Human UI routes are protected only when both `AUTH_ORIGIN` and `APP_ID` are configured.

If protected, droplet-chat should verify sessions through the `DROPLET_AUTH` service binding.

### Agent/Human JSON API

```txt
GET    /api/health
GET    /api/room
GET    /api/events?after=
GET    /api/messages
POST   /api/messages
GET    /api/messages/:messageId
PATCH  /api/messages/:messageId
DELETE /api/messages/:messageId

GET    /api/messages/:messageId/replies
POST   /api/messages/:messageId/replies
PATCH  /api/replies/:replyId
DELETE /api/replies/:replyId

POST   /api/attachments
GET    /api/attachments/:attachmentId
GET    /api/attachments/:attachmentId/download
```

Agent API routes must require `AGENT_API_KEY`.

No task-level endpoints should be added in the first pass.

---

## Realtime Event Broadcast Rules

Every successful write should:

1. write to SQLite
2. write event to `events`
3. broadcast event over WebSocket
4. return response to caller

Broadcast events should be small.

For large entities, send enough summary data for the UI to update, but allow the UI to fetch detail if needed.

---

## Suggested Repository Structure

```txt
.
├── AGENT.md
├── PLAN.md
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
├── alchemy.run.ts
├── scripts
│   └── generate-api-key.ts
├── src
│   ├── index.ts
│   ├── env.ts
│   ├── room-object.ts
│   ├── routes
│   │   ├── ui.ts
│   │   ├── api.ts
│   │   ├── attachments.ts
│   │   ├── websocket.ts
│   │   └── health.ts
│   ├── room
│   │   ├── messages.ts
│   │   ├── replies.ts
│   │   ├── events.ts
│   │   └── schema.ts
│   ├── files
│   │   ├── r2.ts
│   │   ├── upload.ts
│   │   └── download.ts
│   ├── auth
│   │   ├── agent-key.ts
│   │   ├── droplet-auth.ts
│   │   └── identity.ts
│   ├── html
│   │   ├── layout.ts
│   │   ├── chat.ts
│   │   ├── thread.ts
│   │   └── components.ts
│   ├── client
│   │   ├── chat.ts
│   │   ├── websocket.ts
│   │   ├── threads.ts
│   │   └── uploads.ts
│   ├── effect
│   │   ├── errors.ts
│   │   ├── services.ts
│   │   └── runtime.ts
│   └── types.ts
├── examples
│   ├── agent-client
│   │   └── index.ts
│   └── curl
│       └── README.md
└── tests
    ├── messages.test.ts
    ├── replies.test.ts
    ├── events.test.ts
    ├── attachments.test.ts
    └── auth.test.ts
```

---

## Package Scripts

Suggested `package.json` scripts:

```json
{
  "scripts": {
    "dev": "alchemy dev",
    "deploy": "alchemy deploy",
    "test": "bun test",
    "generate:api-key": "bun run scripts/generate-api-key.ts"
  }
}
```

Exact Alchemy commands should be adjusted to match the current Alchemy v2 CLI.

---

## Alchemy Stack Requirements

The Alchemy stack should create:

* Worker
* Durable Object namespace
* R2 bucket
* bindings
* vars
* secrets
* optional service binding to droplet-auth

Pseudo-shape:

```ts
import alchemy from "alchemy";
import { Worker, DurableObjectNamespace, R2Bucket } from "alchemy/cloudflare";

const app = await alchemy("droplet-chat");

const bucket = await R2Bucket("droplet-chat-files", {
  name: "droplet-chat-files"
});

const room = await DurableObjectNamespace("droplet-chat-room", {
  className: "ChatRoom"
});

await Worker("droplet-chat-worker", {
  name: "droplet-chat",
  entrypoint: "./src/index.ts",
  compatibilityDate: "2026-06-01",
  bindings: {
    ROOM: room,
    FILES: bucket,

    ROOM_NAME: process.env.ROOM_NAME ?? "droplet-chat",
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
    MAX_UPLOAD_BYTES: process.env.MAX_UPLOAD_BYTES ?? "1073741824",

    // Optional droplet-auth integration:
    AUTH_ORIGIN: process.env.AUTH_ORIGIN,
    APP_ID: process.env.APP_ID,

    // Optional service binding to droplet-auth:
    // DROPLET_AUTH: dropletAuthWorker
  }
});

await app.finalize();
```

This is conceptual. Agents should confirm exact current Alchemy v2 APIs during implementation.

If `AUTH_ORIGIN` and `APP_ID` are set, the deployment should also bind `DROPLET_AUTH`.

---

## Environment Parsing

Runtime env shape:

```ts
type Env = {
  ROOM: DurableObjectNamespace<ChatRoom>;
  FILES: R2Bucket;

  ROOM_NAME: string;
  PUBLIC_ORIGIN: string;
  ROOM_DESCRIPTION?: string;
  MAX_UPLOAD_BYTES?: string;

  AGENT_API_KEY: string;

  AUTH_ORIGIN?: string;
  APP_ID?: string;
  DROPLET_AUTH?: Fetcher;
};
```

Human UI auth mode:

```ts
const humanAuthEnabled = Boolean(env.AUTH_ORIGIN && env.APP_ID);
```

Upload size parsing:

```ts
const maxUploadBytes = Number(env.MAX_UPLOAD_BYTES ?? "1073741824");
```

If `MAX_UPLOAD_BYTES` is malformed or less than/equal to zero, fail loudly during env parsing.

If `humanAuthEnabled` is true and `DROPLET_AUTH` is missing, fail loudly during env parsing.

---

## Durable Object Responsibilities

The `ChatRoom` Durable Object should handle internal room operations.

Suggested methods/routes inside DO:

```txt
POST /internal/messages
GET  /internal/messages
GET  /internal/events
POST /internal/replies
POST /internal/attachments/metadata
GET  /internal/ws
```

The outer Worker should:

* authenticate requests
* validate request shape
* forward stateful operations to DO
* handle R2 file bytes
* serve static/server-rendered UI
* verify droplet-auth sessions through service binding if enabled

The DO should:

* enforce thread nesting rules
* serialize writes
* store data
* broadcast realtime events
* manage WebSocket connections

---

## File Upload Flow

### Human Upload

1. User selects file in UI.
2. Browser sends multipart request to `/api/attachments`.
3. Worker authenticates user only if UI auth is enabled.
4. Worker validates size against `MAX_UPLOAD_BYTES`.
5. Worker writes file bytes to R2.
6. Worker sends metadata to Durable Object.
7. Durable Object stores attachment metadata.
8. Durable Object creates event.
9. Durable Object broadcasts event.
10. UI updates in real time.

### Agent Upload

Same endpoint, but with:

```txt
Authorization: Bearer <AGENT_API_KEY>
```

---

## Agent Usage Examples

### Post Message

```sh
curl -X POST "$CHAT_URL/api/messages" \
  -H "Authorization: Bearer $AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "authorId": "agent-a",
    "authorName": "Agent A",
    "body": "I am starting the database schema review."
  }'
```

### Get New Events After Timestamp

```sh
curl "$CHAT_URL/api/events?after=2026-01-01T16:32:00.000Z" \
  -H "Authorization: Bearer $AGENT_API_KEY"
```

---

## Human UI Implementation Plan

Start with server-rendered HTML and one small browser script.

Do not use a heavy SPA framework unless the UI becomes painful.

Initial files:

```txt
src/html/layout.ts
src/html/chat.ts
src/client/chat.ts
src/client/websocket.ts
src/client/uploads.ts
```

Client script responsibilities:

* connect WebSocket
* fetch initial messages
* append new messages
* send message form
* open thread panel
* send thread reply
* upload file
* reconnect WebSocket
* maintain local display name if unauthenticated

---

## Message Ordering

Use server timestamps from the Durable Object.

Do not trust client timestamps.

For identical timestamps, sort by ID as tiebreaker.

Recommended ordering:

```sql
ORDER BY created_at ASC, id ASC
```

---

## IDs

Use prefixed IDs.

Examples:

```txt
msg_...
reply_...
att_...
evt_...
```

Use high-entropy random IDs or UUIDv7.

UUIDv7 is attractive because it sorts roughly by time.

---

## Security Requirements

* Require `AGENT_API_KEY` for all agent API routes.
* Do not log API keys.
* Do not expose R2 object keys directly unless intended.
* Enforce upload size limit.
* Default upload size limit is 1 GiB.
* Escape all user-generated content in HTML.
* Use `Content-Disposition: attachment` for downloads.
* Reject nested thread creation.
* Validate all JSON payloads.
* Rate limit writes if practical.
* If `AUTH_ORIGIN` and `APP_ID` are configured, require valid droplet-auth session for human UI.
* If human UI auth is enabled, verify droplet-auth sessions through the `DROPLET_AUTH` service binding.
* If `AUTH_ORIGIN` and `APP_ID` are not both configured, human UI is intentionally unprotected.

---

## Beta Defaults

Recommended defaults:

```txt
MAX_UPLOAD_BYTES=1073741824
```

Recommended auth posture:

```txt
Human UI: protected only when AUTH_ORIGIN and APP_ID are set
Agent API: always protected by AGENT_API_KEY
```

---

## Milestones

### Milestone 1 — Skeleton

* Create TypeScript Worker project.
* Rename project to `droplet-chat`.
* Add Alchemy v2 orchestration.
* Add Effect v4 beta.
* Add Durable Object class.
* Add R2 binding.
* Add env parsing.
* Add `.env.example`.
* Add `/api/health`.
* Add basic HTML page.
* Add Bun API key generation script.

Acceptance criteria:

* Project runs locally.
* `/api/health` returns `{ ok: true }`.
* Alchemy stack defines Worker, Durable Object, and R2 bucket.
* `.env.example` includes `MAX_UPLOAD_BYTES=1073741824`.
* `bun run generate:api-key` prints a cryptographically random API key.

---

### Milestone 2 — Auth Boundaries

* Add `AGENT_API_KEY` verification for agent API routes.
* Add optional droplet-auth human UI protection.
* Use `DROPLET_AUTH` service binding for droplet-auth verification.
* If `AUTH_ORIGIN` and `APP_ID` are set, protect UI.
* If either is missing, leave UI unprotected.
* If auth is enabled but `DROPLET_AUTH` binding is missing, fail loudly.

Acceptance criteria:

* Agent API rejects missing API key.
* Agent API rejects incorrect API key.
* Agent API accepts correct API key.
* UI is unprotected when auth config is missing.
* UI requires login when auth config is present.
* droplet-auth session verification uses service binding.

---

### Milestone 3 — Durable Object Storage

* Add SQLite schema initialization.
* Add message insert/list.
* Add event insert/list.
* Add top-level message API.

Acceptance criteria:

* `POST /api/messages` creates message.
* `GET /api/messages` lists messages.
* `GET /api/events?after=` returns new events.

---

### Milestone 4 — Realtime WebSockets

* Add `/ws`.
* Connect browser UI.
* Broadcast `message.created`.
* Add reconnect logic.

Acceptance criteria:

* Two browser tabs see new messages in real time.
* Idle WebSockets use hibernation-friendly DO APIs.

---

### Milestone 5 — Threads

* Add reply table.
* Add create reply endpoint.
* Add list replies endpoint.
* Add UI for opening thread.
* Reject nested threads.

Acceptance criteria:

* User can reply under top-level message.
* Replies appear in real time or after refresh.
* Replies cannot have replies.

---

### Milestone 6 — File Uploads

* Add R2 upload.
* Add attachment metadata table.
* Add attachment download route.
* Add upload UI.
* Add agent upload support.
* Enforce 1 GiB default max upload size.
* Make max upload size configurable through `MAX_UPLOAD_BYTES`.

Acceptance criteria:

* Human can upload file with message.
* Agent can upload file.
* File metadata appears in chat.
* File can be downloaded.
* Uploads over `MAX_UPLOAD_BYTES` are rejected.
* Default limit is 1 GiB.

---

### Milestone 7 — Agent API

* Add `GET /api/events?after=`.
* Add agent post message.
* Add agent post reply.
* Add examples.

Acceptance criteria:

* Agent can poll for new events after timestamp.
* Agent can post messages.
* Agent can post thread replies.
* All agent routes require `AGENT_API_KEY`.

---

### Milestone 8 — Documentation

* Write README.
* Write AGENT.md.
* Add curl examples.
* Add deployment instructions.
* Add API key generation instructions.
* Add droplet-auth optional integration notes.
* Document `DROPLET_AUTH` service binding.
* Document `MAX_UPLOAD_BYTES`.
* Add recovery/troubleshooting notes.

Acceptance criteria:

* A new user can deploy one chat room.
* A user can generate an agent API key.
* A user can configure 1 GiB default upload limit or override it.
* A human can use the UI.
* An agent can post and poll messages.
* File upload is documented.
* Optional droplet-auth protection is documented.
* Service binding requirement is documented.

---

## Testing Plan

### Unit Tests

* env parsing
* human auth mode detection
* missing `DROPLET_AUTH` binding when auth enabled
* `MAX_UPLOAD_BYTES` default
* malformed `MAX_UPLOAD_BYTES`
* API key generation shape
* API key auth
* timestamp cursor parsing
* message validation
* thread validation
* upload size validation

### Durable Object Tests

* schema initialization
* message insert/list
* event insert/list
* reply insert/list
* reject nested thread
* attachment metadata insert

### Integration Tests

* unprotected UI when auth config is missing
* protected UI when auth config is present
* droplet-auth verification uses service binding
* agent API rejects missing key
* agent API rejects wrong key
* agent API accepts correct key
* create message
* fetch messages after timestamp
* create thread reply
* upload file metadata
* reject upload over max size
* WebSocket broadcast if practical

### Manual Tests

* generate API key with Bun script
* set `AGENT_API_KEY`
* set or override `MAX_UPLOAD_BYTES`
* open UI with no auth config
* open UI with droplet-auth config and service binding
* open two browser tabs and send messages
* create thread
* upload file under 1 GiB limit
* verify oversized upload is rejected
* download file
* agent posts with curl
* agent polls after timestamp

---

## README Requirements

README should include:

1. What droplet-chat is.
2. Why it exists.
3. How it differs from Slack/Discord.
4. Beta warning.
5. Cloudflare requirements.
6. Alchemy v2 setup.
7. Effect v4 beta note.
8. Required secrets.
9. Required vars.
10. `.env` configuration.
11. API key generation instructions.
12. `MAX_UPLOAD_BYTES` configuration.
13. Deploy instructions.
14. Human UI usage.
15. Optional droplet-auth protection.
16. Worker service binding requirement for droplet-auth.
17. Agent API usage.
18. File upload usage.
19. Security notes.
20. Known limitations.

---

## Known Beta Limitations

* Single room only.
* No granular permissions.
* No multiple channels.
* No nested threads.
* No reactions.
* No advanced search.
* No message pagination polish.
* No droplet-auth-generated agent API keys yet.
* No task-level endpoints.
* No project management features.
* No sophisticated identity model.
* No mobile app.
* No push notifications.

These limitations are acceptable for beta.

---

## Future Ideas

* API keys generated by droplet-auth
* per-agent identity tokens
* project-management app interoperability
* task-claim message rendering from external app
* full-text search
* markdown rendering
* reactions
* message editing history
* quote/reply links
* GitHub issue integration
* Slack bridge
* Discord bridge
* MCP server wrapper
* daily project digest
* AI-generated status summary
* import/export room archive

