import { generateAuthenticationOptions, generateRegistrationOptions } from "@simplewebauthn/server";
import type { AppConfig, PasskeyRecord } from "../types";
import { base64UrlToBytes } from "../crypto/base64url";

export function rpId(config: AppConfig): string {
  return config.authOrigin.hostname;
}

export async function registrationOptions(config: AppConfig, input: { email: string; label: string }) {
  return generateRegistrationOptions({
    rpName: "Droplet Auth",
    rpID: rpId(config),
    userName: input.email,
    userDisplayName: input.label || input.email,
    attestationType: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
}

export async function authenticationOptions(config: AppConfig) {
  return generateAuthenticationOptions({
    rpID: rpId(config),
    userVerification: "preferred",
  });
}

export function credentialForVerification(passkey: PasskeyRecord) {
  return {
    id: passkey.credentialId,
    publicKey: base64UrlToBytes(passkey.publicKey) as Uint8Array<ArrayBuffer>,
    counter: passkey.counter,
  };
}
