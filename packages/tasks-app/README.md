# droplet-tasks

Droplet Tasks is a tiny project tracker for Cloudflare Workers. One deployed Worker equals one project.

It provides server-rendered task pages, infinitely nested tasks, configurable statuses, append-only work-log notes, and agent-friendly JSON APIs.

## Stack

- Runtime: Cloudflare Workers
- State: SQLite-backed Durable Object `ProjectState`
- Orchestration: Alchemy v2
- Language: TypeScript
- Package manager: Bun
- Auth: optional `droplet-auth`

## Run

```sh
bun install
bun run check
bun run test
```

This project does not use Wrangler as its workflow or source of truth. Alchemy owns Worker configuration, Durable Object bindings, SQLite backend setup, environment variables, and optional service bindings.

## Deploy

Configure Cloudflare for Alchemy if needed:

```sh
bunx alchemy configure
```

Deploy with auth disabled:

```sh
PROJECT_NAME="My Project" bun run --cwd packages/tasks-app deploy
```

The command prints the Worker URL to use for manual testing.

## Optional Auth

Auth is all-or-nothing.

Auth is enabled only when both variables are set:

```txt
AUTH_ORIGIN=https://auth.example.com
APP_ID=my-project-tasks
```

If either is missing, every page and API route is public.

`APP_ID` must be registered in the `droplet-auth` server's `ALLOWED_APPS` map.

This app uses the Worker auth helper from `@whnvr/droplet/auth/worker`.

## Optional Auth Service Binding

Set `AUTH_WORKER_NAME` during deployment to bind directly to the auth Worker:

```sh
PROJECT_NAME="My Project" \
AUTH_ORIGIN="https://auth.example.com" \
APP_ID="my-project-tasks" \
AUTH_WORKER_NAME="droplet-auth" \
bun run --cwd packages/tasks-app deploy
```

The service binding is used for token exchange and JWKS verification. It does not enable auth by itself.

Without `AUTH_WORKER_NAME`, the app falls back to public `fetch()` for token exchange and JWKS verification. In some Worker-to-Worker setups those public requests may be blocked, so the service binding is the preferred auth path.

## Task Model

Tasks use `parentId`, so nesting depth is unlimited. There are no fixed epic/feature/story levels.

Each task has:

- title
- markdown description
- status
- child tasks
- append-only work-log notes

Notes cannot be edited or deleted in the first version.

## Terminal Status Rule

A task cannot enter a terminal status until all descendants are terminal. If blocked, the app returns or links to the deepest incomplete descendant.

## Agent API

Agent routes live under `/api/agent/*`:

```txt
GET    /api/agent/project
GET    /api/agent/tree
GET    /api/agent/tasks/:id
GET    /api/agent/tasks?status=ready
POST   /api/agent/tasks
PATCH  /api/agent/tasks/:id
POST   /api/agent/tasks/:id/notes
GET    /api/agent/statuses
```

Agents should append progress to task notes instead of overwriting descriptions.

Mutation success responses use this shape:

```json
{
  "ok": true,
  "result": {}
}
```

Error responses use this shape:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message"
  }
}
```

## First Manual Test Checklist

Deploy with Alchemy and use the printed Worker URL.

Auth disabled pass:

1. Open `/health` and confirm `{ "ok": true }`.
2. Open `/` and confirm the configured project name renders.
3. Create a root task.
4. Open the task page.
5. Edit the title and description.
6. Create a child task.
7. Create a grandchild task.
8. Append work-log notes.
9. Try to mark the parent terminal while a descendant is incomplete.
10. Confirm the blocking link points to the deepest incomplete task.
11. Mark descendants terminal, then mark the parent terminal.
12. Open `/settings`.
13. Create and edit a custom status.
14. Try deleting a status that is in use and confirm it is blocked.
15. Call `/api/agent/project`.
16. Call `/api/agent/tree`.
17. Create a task through `POST /api/agent/tasks`.
18. Append a note through `POST /api/agent/tasks/:id/notes`.

Auth enabled pass:

1. Register `APP_ID` in the Droplet Auth server's `ALLOWED_APPS` map.
2. Deploy with `AUTH_ORIGIN`, `APP_ID`, and `AUTH_WORKER_NAME`.
3. Open `/` and confirm redirect to `droplet-auth`.
4. Complete passkey login and confirm redirect back to the task app.
5. Call `/api/agent/project` without a session and confirm `401`.
6. Confirm authenticated browser pages load after login.

## Beta Limitations

- No multi-project mode
- No assignments or agent locking
- No drag-and-drop
- No real-time collaboration
- No note editing
- No note deletion
- Breaking changes are acceptable during beta

## Template Promotion

`packages/droplet/templates/tasks/README.md` is generated from this README by the tasks template promotion script. Update this file first, then promote the template:

```sh
bun run promote:tasks
```
