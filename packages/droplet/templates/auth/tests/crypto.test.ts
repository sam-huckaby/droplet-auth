import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { sha256Base64Url, timingSafeEqual } from "../src/crypto/hashing";
import { publicJwksFromPrivateSecret, signAppSession, verifyAppSessionToken } from "../src/crypto/signing";

describe("crypto helpers", () => {
  it("hashes consistently", async () => {
    await expect(sha256Base64Url("token")).resolves.toBe(await sha256Base64Url("token"));
  });

  it("compares strings with hash-based timing safe comparison", async () => {
    await expect(timingSafeEqual("a", "a")).resolves.toBe(true);
    await expect(timingSafeEqual("a", "b")).resolves.toBe(false);
  });

  it("signs and verifies ES256 app sessions", async () => {
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const jwk = await exportJWK(privateKey);
    jwk.kid = "default";
    jwk.alg = "ES256";
    jwk.use = "sig";
    const secret = JSON.stringify(jwk);
    const token = await signAppSession(secret, { iss: "https://auth.example.com", aud: "photos", sub: "pk_1", email: "sam@example.com", isAdmin: false }, new Date(Date.now() + 60_000));
    const publicJwks = await publicJwksFromPrivateSecret(secret);
    const verified = await verifyAppSessionToken(token, publicJwks.keys[0], { issuer: "https://auth.example.com", audience: "photos" });
    expect(verified.payload.sub).toBe("pk_1");
    expect(verified.payload.email).toBe("sam@example.com");
  });
});
