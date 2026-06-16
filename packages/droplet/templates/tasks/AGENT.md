# AGENT.md

## Project Status

This project is in beta.

Breaking changes are acceptable.

Do not preserve backward compatibility unless explicitly instructed.

Prefer simple, clean, correct implementation over compatibility layers, migrations, or abstractions designed only for future unknown versions.

---

## Project Purpose

This repo implements a tiny, self-contained project management app for Cloudflare Workers.

Each deployed Worker instance represents exactly one project.

There is no multi-project mode.

The app is designed for:

* humans tracking project progress
* agents reading project context
* agents creating/updating tasks
* agents appending work logs
* per-project deployment
* optional passkey auth integration

---

## Hard Requirements

* One deployed app instance equals one project.
* Never build multi-project support unless explicitly requested.
* Tasks must be infinitely nestable.
* Tasks must have a title.
* Tasks must have a markdown description.
* Tasks must have a status.
* Tasks must have child tasks displayed below the description.
* Tasks must have a notes/work log section.
* Task notes must be append-only.
* Existing task notes cannot be edited in the first version.
* Existing task notes cannot be deleted in the first version.
* Agents should use notes as a work log instead of overwriting task descriptions.
* Statuses must be configurable.
* Terminal statuses must be supported.
* A task cannot enter a terminal state unless all descendants are terminal.
* If terminal transition is blocked, return/link to the deepest incomplete descendant.
* Auth must be optional.
* If auth is configured, auth is required on all pages and APIs.
* If auth is not configured, auth is required nowhere.
* Use Alchemy v2 for orchestration.
* Use Effect v4 beta where it improves clarity.
* Use `@whnvr/droplet/auth/worker` for Droplet Auth integration; do not duplicate the auth helper in this app.
* Keep the app intentionally simple.
* Provide an agent-readable JSON API.
* Do not require agents to scrape HTML.

---

## Auth Rules

Auth is all-or-nothing.

Auth is enabled only when both are configured:

```txt
AUTH_ORIGIN
APP_ID
```

When auth is enabled:

* every page requires auth
* every API route requires auth
* every agent route requires auth
* browser requests should redirect to auth
* API requests should return `401`

When auth is disabled:

* no page requires auth
* no API route requires auth
* no login UI should appear

Do not create a mixed public/private mode.

---

## Task Model

A task has:

```ts
type Task = {
  id: string;
  parentId: string | null;
  title: string;
  descriptionMarkdown: string;
  statusId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
};
```

Do not use fixed hierarchy levels like epic/feature/story/subtask.

Use `parentId`.

Tasks can nest infinitely deep.

---

## Notes / Work Log

Each task has append-only notes.

Notes are used as the task work log.

Notes must not be edited in the first version.

Notes must not be deleted in the first version.

Agents should append work updates instead of overwriting descriptions.

Example note:

```txt
Agent started implementation in branch `feature/task-api`.
```

Another example:

```txt
Completed terminal-state validation. Added tests for deepest incomplete descendant behavior.
```

Use notes for:

* implementation progress
* branch names
* blockers
* decisions
* test results
* handoff context
* agent activity

Do not implement note editing or note deletion unless explicitly requested later.

---

## Status Rules

Statuses are configurable.

A status has:

```ts
type Status = {
  id: string;
  name: string;
  kind: "open" | "active" | "blocked" | "terminal";
  sortOrder: number;
  color?: string;
  isDefault: boolean;
};
```

Rules:

* at least one status must exist
* exactly one default status should exist
* at least one terminal status must exist
* terminal statuses represent completion/cancellation
* statuses in use cannot be deleted in the beta version

---

## Terminal State Rule

A task cannot move into a terminal status unless every descendant task is already terminal.

This includes all nested descendants, not just direct children.

If blocked, return the deepest incomplete descendant.

UI should show a human-readable error with a link.

API should return:

```json
{
  "ok": false,
  "error": {
    "code": "TERMINAL_STATE_BLOCKED",
    "message": "Task cannot enter a terminal state until all descendants are terminal.",
    "blockingTask": {
      "id": "task_deepest",
      "title": "Implement callback tests",
      "url": "/tasks/task_deepest"
    }
  }
}
```

---

## Human UI Requirements

Use server-rendered HTML.

No SPA is required.

Keep the UI simple.

### Home Page

Show:

* project name
* root tasks table
* create root task button
* settings link

### Task Page

Show:

* breadcrumb path
* status selector at the top
* title
* markdown description
* edit description action
* append-only notes/work log
* add note form
* child task table
* create child task button

Child task table columns:

```txt
Status
Title
Children
Updated
```

### Settings Page

Show:

* project name
* auth status
* status configuration
* create/edit statuses

---

## Agent API Requirements

Agents need a JSON API.

Do not require agents to scrape HTML.

Important routes:

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

Responses should be explicit, boring, and easy for an agent to consume.

Use consistent error shape:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Agents must use `POST /api/agent/tasks/:id/notes` to append work-log updates.

Do not add agent endpoints for editing or deleting notes in the first version.

---

## Error Codes

Use stable error codes:

```txt
NOT_FOUND
VALIDATION_ERROR
AUTH_REQUIRED
INVALID_STATUS
TERMINAL_STATE_BLOCKED
CYCLE_DETECTED
STATUS_IN_USE
DEFAULT_STATUS_REQUIRED
TERMINAL_STATUS_REQUIRED
NOTE_IMMUTABLE
```

---

## Alchemy Instructions

Use Alchemy v2 as the deployment/orchestration layer.

Do not make Wrangler the source of truth.

Wrangler may be used only as a compatibility detail if needed.

The Alchemy stack should configure:

* Worker
* Durable Object
* Durable Object migration
* project name
* optional auth config
* routes/domains if applicable

---

## Effect Instructions

Use Effect v4 beta where useful.

Good places for Effect:

* environment parsing
* typed errors
* status transition validation
* terminal-state validation
* Durable Object service access
* auth mode detection
* agent API command handling

Do not make the code unreadable just to use Effect.

Do not over-abstract simple route handlers.

---

## Coding Style

Use TypeScript.

Keep route handlers small.

Keep domain logic in `src/domain`.

Keep Durable Object persistence in `src/project-state.ts`.

Keep HTML rendering in `src/html`.

Keep auth integration in `src/auth`.

Keep agent API routes in `src/routes/agent.ts`.

Prefer boring, explicit code.

---

## Security Rules

* If auth is enabled, protect every page and API.
* If auth is disabled, do not pretend anything is private.
* Sanitize rendered Markdown.
* Validate all task IDs.
* Validate all status IDs.
* Prevent task cycles.
* Do not expose secret config values.
* Do not trust client-provided status transitions.
* Enforce terminal-state rules server-side.
* Treat notes as immutable work-log records.
* Do not allow clients or agents to mutate existing notes.
* Do not allow clients or agents to delete existing notes.

---

## Testing Expectations

Add or update tests for changed behavior.

Critical tests:

* create task
* create nested task
* prevent task cycle
* update description
* append note
* verify note cannot be edited
* verify note cannot be deleted
* verify agent can append note
* verify appending note creates activity event
* create status
* prevent deleting status in use
* enforce at least one terminal status
* block terminal state with incomplete descendants
* return deepest incomplete descendant
* auth disabled allows access
* auth enabled requires access
* agent API tree response
* agent API terminal-state error response

---

## Beta Boundaries

Do not add these unless requested:

* multi-project mode
* assignments
* agent locking
* kanban board
* drag-and-drop
* real-time collaboration
* comments with threads
* file attachments
* rich text editor
* note editing
* note deletion
* external integrations
* vendored dependency source

Append-only notes are intentional, not a missing feature.
