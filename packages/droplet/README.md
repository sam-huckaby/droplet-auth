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

The Worker helper functions are intentionally small and composable. You can wire them into any routing style.

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
      // Clears the Droplet Auth session cookie and redirects the user.
      // Use this for logout routes in protected apps.
      return createLogoutResponse();
    }

    // Converts a Droplet Auth callback code into an app session cookie.
    // Put this near the top of your fetch handler so callback requests are handled before protected content.
    const callback = await handleAuthCallback(request, {
      appId: env.APP_ID,
      authOrigin: env.AUTH_ORIGIN,
      authService: env.AUTH_SERVICE,
    });
    if (callback) return callback;

    // Reads the app session cookie, fetches Droplet Auth public keys, and verifies the JWT.
    // Use this before serving protected routes.
    const session = await verifyAppSession(request, {
      appId: env.APP_ID,
      authOrigin: env.AUTH_ORIGIN,
      authService: env.AUTH_SERVICE,
    });
    if (!session) {
      // Sends unauthenticated users to the Droplet Auth login page.
      // Use this when verifyAppSession returns null.
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

The browser helper only starts the login redirect. Session verification should happen in your Worker.

```ts
import { createDropletAuthClient } from "@whnvr/droplet/auth/browser";

// Creates a browser-side client that knows which Droplet Auth app to use.
// Use this in frontend code that needs to start the login flow.
const auth = createDropletAuthClient({
  authOrigin: "https://auth.example.workers.dev",
  appId: "photos",
});

// Redirects the browser to Droplet Auth and returns here after login.
// Use this when a browser route needs the user to sign in.
auth.requireLogin();

// You can pass an explicit return URL when the user should come back somewhere else.
auth.requireLogin("https://photos.example.com/dashboard");
```
