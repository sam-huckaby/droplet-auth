# Droplet

Droplet packages useful Cloudflare configurations as readable app builders and helper APIs. Builders create deployable Cloudflare app projects in your account; helpers let your Workers integrate with those deployed apps.

The goal is to make functionality you would normally pay a hosted service for available as small Cloudflare apps that can run on the free tier.

## What You Get

### Builders

Builders are CLI recipes that create complete, readable Cloudflare app projects. Once created, you have all the code and the ability to add any specific features you might want.

Current builders:

```sh
bunx @whnvr/droplet make auth my-auth
bunx @whnvr/droplet make tasks my-tasks
```

This creates a standalone Droplet Auth app that you deploy to your Cloudflare account. It gives you passkey auth, an admin portal, app-scoped sessions, JWKS verification, and protected Worker integration without paying for a separate hosted auth service.

The tasks builder creates a standalone Droplet Tasks app: one Cloudflare Worker-backed project tracker with nested tasks, configurable statuses, append-only notes, and an agent JSON API.

Future builders will follow the same shape:

```sh
droplet make <app> <dir>
```

### Helpers

Helpers are importable APIs from `@whnvr/droplet` that let your Workers integrate with deployed Droplet apps.

Helpers come after builders because they assume you already have a Droplet app deployed.

Current helpers:

- `@whnvr/droplet/auth/worker`
- `@whnvr/droplet/auth/browser`

Example:

```ts
import {
  createAuthRedirect,
  handleAuthCallback,
  verifyAppSession,
} from "@whnvr/droplet/auth/worker";
```

## Current Droplet: Auth And Tasks

Droplet Auth is the first builder. It creates a Cloudflare Worker app with:

- Passkey authentication
- Admin portal
- SQLite-backed Durable Object state
- App-scoped sessions
- JWKS endpoint
- Worker-to-Worker service binding support
- Protected Worker helper integration

Droplet Tasks creates a Cloudflare Worker app with:

- SQLite-backed Durable Object project state
- Infinitely nested tasks
- Configurable status workflow
- Append-only task notes
- Agent-readable JSON API
- Optional Droplet Auth protection

Read more:

- `packages/auth-app/README.md` for deployment details
- `packages/tasks-app/README.md` for task app deployment details
- `packages/droplet/README.md` for helper API usage

## Packages

- `packages/droplet` publishes `@whnvr/droplet` with CLI builders, helpers, and templates.
- `packages/auth-app` contains the source-of-truth Droplet Auth app used to generate the auth template.
- `packages/tasks-app` contains the source-of-truth Droplet Tasks app used to generate the tasks template.
- `packages/droplet/templates/auth` is the generated standalone auth template copied by `droplet make auth`.
- `packages/droplet/templates/tasks` is the generated standalone tasks template copied by `droplet make tasks`.

## Development

### Install

Install dependencies from the repo root:

```sh
bun install
```

### Check And Test

Run checks and tests:

```sh
bun run check
bun run test
```

### Build

Build the publishable package:

```sh
bun run build
```

### Promote Auth Template

`packages/auth-app` is the source of truth for the auth builder. `packages/droplet/templates/auth` is generated from it.

Regenerate the template before publishing:

```sh
bun run promote:auth
```

Check that the committed template is fresh:

```sh
bun run check:auth-template
```

The generated template rewrites monorepo-only package metadata into standalone package metadata and fails if forbidden local references such as `workspace:`, `catalog:`, or `packages/auth-app` remain.

### Promote Tasks Template

`packages/tasks-app` is the source of truth for the tasks builder. `packages/droplet/templates/tasks` is generated from it.

Regenerate the template before publishing:

```sh
bun run promote:tasks
```

Check that the committed template is fresh:

```sh
bun run check:tasks-template
```

The generated template rewrites monorepo-only package metadata into standalone package metadata and fails if forbidden local references such as `workspace:`, `catalog:`, or `packages/tasks-app` remain.

### Publish Dry Run

Dry-run the npm package publish:

```sh
bun run publish:dry-run
```

Do not publish from the root package. The root package is private; publish `@whnvr/droplet` through the package script.

### Local Source Dependencies

`repos/alchemy` remains a local source dependency for development and debugging.

`repos/effect` remains available for source inspection, but the workspace resolves Effect packages from registry-pinned versions by default to avoid Bun lockfile duplication around local peer dependencies.

Do not modify `repos/` unless intentionally working on those upstream subtrees.
