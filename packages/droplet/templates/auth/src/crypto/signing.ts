import { exportJWK, importJWK, SignJWT, jwtVerify, type JWK, type JWTPayload } from "jose";

export interface AppSessionClaims extends JWTPayload {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  isAdmin: boolean;
}

export async function privateKeyFromSecret(secret: string): Promise<CryptoKey> {
  let jwk: JWK;
  try {
    jwk = JSON.parse(secret) as JWK;
  } catch {
    throw new Error("AUTH_PRIVATE_KEY must be an ES256 private JWK JSON string");
  }

  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d) {
    throw new Error("AUTH_PRIVATE_KEY must be an ECDSA P-256 private JWK");
  }

  return importJWK(jwk, "ES256") as Promise<CryptoKey>;
}

export async function publicJwksFromPrivateSecret(secret: string): Promise<{ keys: JWK[] }> {
  let publicKey: JWK;
  try {
    publicKey = JSON.parse(secret) as JWK;
  } catch {
    throw new Error("AUTH_PRIVATE_KEY must be an ES256 private JWK JSON string");
  }
  if (publicKey.kty !== "EC" || publicKey.crv !== "P-256" || !publicKey.x || !publicKey.y) {
    throw new Error("AUTH_PRIVATE_KEY must be an ECDSA P-256 private JWK");
  }
  delete publicKey.d;
  publicKey.kid = publicKey.kid ?? "default";
  publicKey.use = "sig";
  publicKey.alg = "ES256";
  return { keys: [publicKey as JWK] };
}

export async function signAppSession(secret: string, claims: AppSessionClaims, expiresAt: Date): Promise<string> {
  const privateKey = await privateKeyFromSecret(secret);
  return new SignJWT({ email: claims.email, isAdmin: claims.isAdmin })
    .setProtectedHeader({ alg: "ES256", kid: "default" })
    .setIssuer(claims.iss)
    .setAudience(claims.aud)
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(privateKey);
}

export async function verifyAppSessionToken(token: string, jwk: JWK, options: { issuer: string; audience: string }) {
  const key = await importJWK(jwk, "ES256");
  return jwtVerify(token, key, { issuer: options.issuer, audience: options.audience });
}
