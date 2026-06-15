export const ADMIN_SESSION_COOKIE = "da_admin";
export const BOOTSTRAP_SESSION_COOKIE = "da_bootstrap";

export function getCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

export function setSessionCookie(name: string, value: string, expiresAt: string): string {
  return `${name}=${encodeURIComponent(value)}; Expires=${new Date(expiresAt).toUTCString()}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name: string): string {
  return `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
