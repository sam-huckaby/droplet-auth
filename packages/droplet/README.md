# @whnvr/droplet

Reusable helpers for Droplet apps.

## Install

```sh
bun add @whnvr/droplet
```

## Create A Droplet Auth App

```sh
bunx @whnvr/droplet make auth my-auth
```

This creates `my-auth` from the readable auth app template included in this package.

## Auth Worker Helper

Use `@whnvr/droplet/auth/worker` inside protected Cloudflare Workers.

```ts
import {
  createAuthRedirect,
  createLogoutResponse,
  handleAuthCallback,
  verifyAppSession,
} from "@whnvr/droplet/auth/worker";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/logout") {
      return createLogoutResponse();
    }

    const callback = await handleAuthCallback(request, {
      appId: env.APP_ID,
      authOrigin: env.AUTH_ORIGIN,
      authService: env.AUTH_SERVICE,
    });
    if (callback) return callback;

    const session = await verifyAppSession(request, {
      appId: env.APP_ID,
      authOrigin: env.AUTH_ORIGIN,
      authService: env.AUTH_SERVICE,
    });
    if (!session) {
      return createAuthRedirect(request, {
        appId: env.APP_ID,
        authOrigin: env.AUTH_ORIGIN,
      });
    }

    return new Response(`Hello ${session.email}`);
  },
};

interface Env {
  APP_ID: string;
  AUTH_ORIGIN: string;
  AUTH_SERVICE?: Fetcher;
}
```

## Browser Helper

```ts
import { createDropletAuthClient } from "@whnvr/droplet/auth/browser";

const auth = createDropletAuthClient({
  authOrigin: "https://auth.example.workers.dev",
  appId: "photos",
});

auth.requireLogin();
```
