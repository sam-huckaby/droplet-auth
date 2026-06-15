import { exportJWK, generateKeyPair } from "jose";

export async function generateAuthPrivateKey(): Promise<string> {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = "default";
  jwk.alg = "ES256";
  jwk.use = "sig";
  return JSON.stringify(jwk);
}
