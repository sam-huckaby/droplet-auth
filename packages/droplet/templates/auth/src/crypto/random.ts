import { bytesToBase64Url } from "./base64url";

export function secureRandomBase64Url(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return bytesToBase64Url(data);
}

export function id(prefix: string): string {
  return `${prefix}_${secureRandomBase64Url(18)}`;
}
