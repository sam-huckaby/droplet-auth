export function createDropletAuthClient(options: { authOrigin: string; appId: string }) {
  return {
    requireLogin(returnTo = globalThis.location.href) {
      const url = new URL("/login", options.authOrigin);
      url.searchParams.set("app", options.appId);
      url.searchParams.set("returnTo", returnTo);
      (globalThis as unknown as { location: { href: string } }).location.href = url.toString();
    },
  };
}

export { createDropletAuthClient as requireLogin };
