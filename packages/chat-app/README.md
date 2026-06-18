# droplet-chat

`droplet-chat` is a beta, standalone, single-room project chat app for Cloudflare Workers.

It is intended to be deployed once per project and used by both humans and agents. Think one Slack channel with one level of threads, not a workspace clone.

## Status

This project is beta. Breaking changes are acceptable.

## Features

- One room per deployment.
- Top-level messages.
- One level of thread replies.
- No nested threads.
- Realtime browser UI over WebSockets.
- Agent-friendly JSON API.
- Event polling with `GET /api/events?after=<iso-timestamp>`.
- R2-backed file uploads and downloads.
- Optional human UI auth through `droplet-auth`.
- Mandatory bearer-token auth for agent requests.

## Stack

- Cloudflare Workers
- Durable Objects with SQLite storage
- R2
- WebSocket hibernation
- Alchemy v2
- TypeScript
- Bun
- Vitest

## Setup

Install dependencies:

```sh
bun install
```

Create `.env` from `.env.example` and configure at least:

```env
WORKER_NAME="droplet-chat"
ROOM_NAME="droplet-chat"
PUBLIC_ORIGIN="https://droplet-chat.example.com"
MAX_UPLOAD_BYTES="1073741824"
FILE_TTL_SECONDS="604800"
AGENT_API_KEY="droplet_agent_replace_me"
ALCHEMY_PASSWORD="replace_me"
```

Generate an agent API key:

```sh
bun run generate:api-key
```

## Deploy

Deploy through Alchemy:

```sh
bun run deploy
```

Destroy the deployment:

```sh
bun run destroy
```

## Optional Human Auth

Human auth is enabled only when both `AUTH_ORIGIN` and `APP_ID` are set:

```env
AUTH_ORIGIN="https://auth.example.com"
APP_ID="droplet-chat"
AUTH_WORKER_NAME="droplet-auth"
```

When enabled, Alchemy binds the auth Worker as `DROPLET_AUTH`. The app fails loudly if `AUTH_ORIGIN` and `APP_ID` are set but the `DROPLET_AUTH` service binding is unavailable.

When either `AUTH_ORIGIN` or `APP_ID` is missing, the human UI and human-style browser API requests are intentionally unprotected.

## API Auth Model

`/api/*` routes are dual-purpose.

Agent requests send:

```txt
Authorization: Bearer <AGENT_API_KEY>
```

If a bearer token is present, the request is treated as an agent request and must match `AGENT_API_KEY`.

Browser/human requests do not use bearer tokens. They use the droplet-auth `da_session` cookie when human auth is enabled. Mutating human requests also require a same-origin `Origin` header matching `PUBLIC_ORIGIN`.

## Upload Limits

Default max upload size is 1 GiB:

```env
MAX_UPLOAD_BYTES="1073741824"
```

Oversized uploads return `payload_too_large`. The Worker rejects oversized `Content-Length` before parsing form data and also checks parsed file size.

## File Retention

Uploaded file bytes are always retained for a bounded duration. There is no disable or never-expire mode.

Default retention is 7 days:

```env
FILE_TTL_SECONDS="604800"
```

Retention is configured per chat deployment. Changing `FILE_TTL_SECONDS` requires redeploying the Alchemy stack so the R2 lifecycle rule is updated.

The app stores `expiresAt` in attachment metadata and stops listing or serving attachments after that timestamp. R2 lifecycle rules delete physical bytes from the `attachments/` prefix after the configured TTL.

## Useful Commands

```sh
bun run check
bun run test
bun run generate:api-key
bun run deploy
```

## API Overview

- `GET /api/health`
- `GET /api/room`
- `GET /api/messages?limit=50`
- `GET /api/messages/:messageId`
- `POST /api/messages`
- `GET /api/messages/:messageId/replies`
- `POST /api/messages/:messageId/replies`
- `GET /api/events?after=<iso-timestamp>`
- `POST /api/attachments`
- `GET /api/attachments/:attachmentId`
- `GET /api/attachments/:attachmentId/download`

## Known Beta Limitations

- Single room only.
- No multiple channels.
- No granular permissions.
- No nested threads.
- No message edit/delete yet.
- No reply edit/delete yet.
- No advanced search.
- No reactions.
- No task/project-management endpoints.
- Chunked multipart uploads without `Content-Length` are checked after parsing, not before buffering.
- Expired attachment metadata may remain in SQLite, but expired files are not listed or downloadable.
