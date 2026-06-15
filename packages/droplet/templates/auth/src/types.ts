import type { AuthState } from "./auth-state";

export type AllowedApps = Record<string, string>;

export interface Env {
  AUTH_STATE: DurableObjectNamespace<AuthState>;
  AUTH_ORIGIN: string;
  ALLOWED_APPS: string;
  BOOTSTRAP_PW: string;
  ALLOW_BOOTSTRAP_PW: string;
  AUTH_PRIVATE_KEY: string;
}

export interface AppConfig {
  authOrigin: URL;
  allowedApps: AllowedApps;
  allowBootstrapPassword: boolean;
}

export type SessionType = "admin" | "app" | "bootstrap_admin";

export type ChallengeType = "registration" | "authentication" | "admin_authentication";

export interface PasskeyRecord {
  id: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  email: string;
  label: string;
  isAdmin: boolean;
  appId: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface EnrollmentLinkRecord {
  id: string;
  tokenHash: string;
  defaultEmail: string | null;
  defaultLabel: string | null;
  createsAdminPasskey: boolean;
  appId: string | null;
  createdByPasskeyId: string | null;
  createdViaBootstrap: boolean;
  createdAt: string;
  expiresAt: string | null;
  consumedAt: string | null;
  consumedByPasskeyId: string | null;
  revokedAt: string | null;
}

export interface SessionRecord {
  id: string;
  type: SessionType;
  passkeyId: string | null;
  email: string | null;
  appId: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface AuditEventRecord {
  id: string;
  eventType: string;
  appId: string | null;
  passkeyId: string | null;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  metadata: string;
}

export interface AuthCodeRecord {
  id: string;
  appId: string;
  passkeyId: string;
  email: string;
  returnTo: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface PasskeyUsageSummary {
  passkeyId: string;
  email: string | null;
  appId: string;
  totalLogins: number;
  lastLoginAt: string;
}

export interface AppUsageSummary {
  appId: string;
  totalLogins: number;
  uniquePasskeys: number;
  lastLoginAt: string;
}
