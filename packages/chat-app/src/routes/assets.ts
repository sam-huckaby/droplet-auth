import { assets } from "./assets-data";

const ICON_CACHE = "public, max-age=31536000, immutable";

const routes: Record<string, { contentType: string; body: string; cacheControl: string }> = {
  "/favicon.ico": { contentType: "image/x-icon", body: assets.faviconIco, cacheControl: ICON_CACHE },
  "/favicon-16x16.png": { contentType: "image/png", body: assets.favicon16, cacheControl: ICON_CACHE },
  "/favicon-32x32.png": { contentType: "image/png", body: assets.favicon32, cacheControl: ICON_CACHE },
  "/apple-touch-icon.png": { contentType: "image/png", body: assets.appleTouchIcon, cacheControl: ICON_CACHE },
  "/android-chrome-192x192.png": { contentType: "image/png", body: assets.androidChrome192, cacheControl: ICON_CACHE },
  "/android-chrome-512x512.png": { contentType: "image/png", body: assets.androidChrome512, cacheControl: ICON_CACHE },
  "/site.webmanifest": { contentType: "application/manifest+json; charset=utf-8", body: assets.siteWebmanifest, cacheControl: "no-cache" },
};

export function handleAsset(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const route = routes[new URL(request.url).pathname];
  if (!route) return null;
  const body = route.contentType.startsWith("application/manifest") ? route.body : base64ToArrayBuffer(route.body);
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "cache-control": route.cacheControl,
      "content-type": route.contentType,
    },
  });
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
