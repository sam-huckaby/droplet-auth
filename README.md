# Droplet

Droplet is a monorepo for small self-hosted Cloudflare Worker apps and reusable helpers.

## Packages

- `packages/droplet` publishes `@whnvr/droplet`.
- `packages/auth-app` contains the deployable Droplet Auth server and examples.

## Development

Install dependencies from the repo root:

```sh
bun install
```

Run checks and tests:

```sh
bun run check
bun run test
```

Build the publishable helper package:

```sh
bun run build
```

Dry-run the npm package publish:

```sh
bun run publish:dry-run
```

## Auth Template Promotion

`packages/auth-app` is the source of truth for the deployable Droplet Auth server. The publishable package includes a generated, standalone template at `packages/droplet/templates/auth`.

Regenerate the template before publishing:

```sh
bun run promote:auth
```

Check that the committed template is fresh:

```sh
bun run check:auth-template
```

The generated template rewrites monorepo-only package metadata into standalone package metadata and fails if forbidden local references such as `workspace:`, `catalog:`, or `packages/auth-app` remain.

The package CLI copies this generated template:

```sh
droplet make auth my-auth
```

## Local Source Dependencies

The root workspace keeps Alchemy and Effect available as local source subtrees under `repos/` for development, auditing, and code discoverability.

Do not publish from the root package. Publish from `packages/droplet` through the package script.
