import { DurableObject } from "cloudflare:workers";
import type {
  AuditEventRecord,
  AuthCodeRecord,
  ChallengeType,
  EnrollmentLinkRecord,
  Env,
  PasskeyRecord,
  AppUsageSummary,
  PasskeyUsageSummary,
  SessionRecord,
  SessionType,
} from "./types";

type PasskeyRow = {
  id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  email: string;
  label: string;
  is_admin: number;
  app_id: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type EnrollmentRow = {
  id: string;
  token_hash: string;
  default_email: string | null;
  default_label: string | null;
  creates_admin_passkey: number;
  app_id: string | null;
  created_by_passkey_id: string | null;
  created_via_bootstrap: number;
  created_at: string;
  expires_at: string | null;
  consumed_at: string | null;
  consumed_by_passkey_id: string | null;
  revoked_at: string | null;
};

type SessionRow = {
  id: string;
  type: SessionType;
  passkey_id: string | null;
  email: string | null;
  app_id: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

type ChallengeRow = {
  id: string;
  challenge: string;
  type: ChallengeType;
  context: string;
  expires_at: string;
  consumed_at: string | null;
};

type AuthCodeRow = {
  id: string;
  app_id: string;
  passkey_id: string;
  email: string;
  return_to: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

type AuditRow = {
  id: string;
  event_type: string;
  app_id: string | null;
  passkey_id: string | null;
  email: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  metadata: string;
};

type PasskeyUsageRow = {
  passkey_id: string;
  email: string | null;
  app_id: string;
  total_logins: number;
  last_login_at: string;
};

type AppUsageRow = {
  app_id: string;
  total_logins: number;
  unique_passkeys: number;
  last_login_at: string;
};

const now = () => new Date().toISOString();

export class AuthState extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.initializeSchema();
    });
  }

  async health(): Promise<{ ok: true }> {
    this.ctx.storage.sql.exec("SELECT 1");
    return { ok: true };
  }

  async createSession(input: {
    id: string;
    sessionHash: string;
    type: SessionType;
    passkeyId?: string;
    email?: string;
    appId?: string;
    expiresAt: string;
  }): Promise<SessionRecord> {
    const createdAt = now();
    this.ctx.storage.sql.exec(
      `INSERT INTO sessions (id, session_hash, type, passkey_id, email, app_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.sessionHash,
      input.type,
      input.passkeyId ?? null,
      input.email ?? null,
      input.appId ?? null,
      createdAt,
      input.expiresAt,
    );
    return this.getSessionByHash(input.sessionHash, input.type) as Promise<SessionRecord>;
  }

  async getSessionByHash(sessionHash: string, type?: SessionType): Promise<SessionRecord | null> {
    const row = type
      ? this.ctx.storage.sql.exec<SessionRow>("SELECT * FROM sessions WHERE session_hash = ? AND type = ?", sessionHash, type).toArray()[0]
      : this.ctx.storage.sql.exec<SessionRow>("SELECT * FROM sessions WHERE session_hash = ?", sessionHash).toArray()[0];
    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
    return mapSession(row);
  }

  async revokeSessionHash(sessionHash: string): Promise<void> {
    this.ctx.storage.sql.exec("UPDATE sessions SET revoked_at = ? WHERE session_hash = ?", now(), sessionHash);
  }

  async createEnrollmentLink(input: {
    id: string;
    tokenHash: string;
    defaultEmail?: string;
    defaultLabel?: string;
    createsAdminPasskey: boolean;
    appId?: string;
    createdByPasskeyId?: string;
    createdViaBootstrap: boolean;
    expiresAt?: string;
  }): Promise<EnrollmentLinkRecord> {
    const createdAt = now();
    this.ctx.storage.sql.exec(
      `INSERT INTO enrollment_links
       (id, token_hash, default_email, default_label, creates_admin_passkey, app_id, created_by_passkey_id, created_via_bootstrap, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.tokenHash,
      input.defaultEmail ?? null,
      input.defaultLabel ?? null,
      input.createsAdminPasskey ? 1 : 0,
      input.appId ?? null,
      input.createdByPasskeyId ?? null,
      input.createdViaBootstrap ? 1 : 0,
      createdAt,
      input.expiresAt ?? null,
    );
    return this.getEnrollmentLinkByHash(input.tokenHash) as Promise<EnrollmentLinkRecord>;
  }

  async getEnrollmentLinkByHash(tokenHash: string): Promise<EnrollmentLinkRecord | null> {
    const row = this.ctx.storage.sql.exec<EnrollmentRow>("SELECT * FROM enrollment_links WHERE token_hash = ?", tokenHash).toArray()[0];
    if (!row) return null;
    return mapEnrollment(row);
  }

  async getUsableEnrollmentLink(tokenHash: string): Promise<EnrollmentLinkRecord | null> {
    const link = await this.getEnrollmentLinkByHash(tokenHash);
    if (!link || link.consumedAt || link.revokedAt) return null;
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return null;
    return link;
  }

  async consumeEnrollmentLink(id: string, passkeyId: string): Promise<void> {
    this.ctx.storage.sql.exec(
      "UPDATE enrollment_links SET consumed_at = ?, consumed_by_passkey_id = ? WHERE id = ? AND consumed_at IS NULL",
      now(),
      passkeyId,
      id,
    );
  }

  async createChallenge(input: {
    id: string;
    challenge: string;
    type: ChallengeType;
    context: unknown;
    expiresAt: string;
  }): Promise<void> {
    this.ctx.storage.sql.exec(
      "INSERT INTO challenges (id, challenge, type, context, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      input.id,
      input.challenge,
      input.type,
      JSON.stringify(input.context),
      now(),
      input.expiresAt,
    );
  }

  async consumeChallenge(id: string, type: ChallengeType): Promise<{ challenge: string; context: unknown } | null> {
    const row = this.ctx.storage.sql.exec<ChallengeRow>("SELECT * FROM challenges WHERE id = ? AND type = ?", id, type).toArray()[0];
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
    this.ctx.storage.sql.exec("UPDATE challenges SET consumed_at = ? WHERE id = ?", now(), id);
    return { challenge: row.challenge, context: JSON.parse(row.context) as unknown };
  }

  async createPasskey(input: {
    id: string;
    credentialId: string;
    publicKey: string;
    counter: number;
    email: string;
    label: string;
    isAdmin: boolean;
    appId?: string;
  }): Promise<PasskeyRecord> {
    const at = now();
    this.ctx.storage.sql.exec(
      `INSERT INTO passkeys (id, credential_id, public_key, counter, email, label, is_admin, app_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.credentialId,
      input.publicKey,
      input.counter,
      input.email,
      input.label,
      input.isAdmin ? 1 : 0,
      input.appId ?? null,
      at,
      at,
    );
    return this.getPasskeyByCredentialId(input.credentialId) as Promise<PasskeyRecord>;
  }

  async getPasskeyByCredentialId(credentialId: string): Promise<PasskeyRecord | null> {
    const row = this.ctx.storage.sql.exec<PasskeyRow>("SELECT * FROM passkeys WHERE credential_id = ?", credentialId).toArray()[0];
    return row ? mapPasskey(row) : null;
  }

  async getPasskey(id: string): Promise<PasskeyRecord | null> {
    const row = this.ctx.storage.sql.exec<PasskeyRow>("SELECT * FROM passkeys WHERE id = ?", id).toArray()[0];
    return row ? mapPasskey(row) : null;
  }

  async listPasskeys(): Promise<PasskeyRecord[]> {
    return this.ctx.storage.sql.exec<PasskeyRow>("SELECT * FROM passkeys ORDER BY created_at DESC").toArray().map(mapPasskey);
  }

  async updatePasskey(id: string, patch: { email?: string; label?: string }): Promise<PasskeyRecord | null> {
    const current = await this.getPasskey(id);
    if (!current) return null;
    this.ctx.storage.sql.exec(
      "UPDATE passkeys SET email = ?, label = ?, updated_at = ? WHERE id = ?",
      patch.email ?? current.email,
      patch.label ?? current.label,
      now(),
      id,
    );
    return this.getPasskey(id);
  }

  async revokePasskey(id: string): Promise<void> {
    this.ctx.storage.sql.exec("UPDATE passkeys SET revoked_at = ?, updated_at = ? WHERE id = ?", now(), now(), id);
  }

  async markPasskeyUsed(id: string, counter: number): Promise<void> {
    this.ctx.storage.sql.exec("UPDATE passkeys SET counter = ?, last_used_at = ?, updated_at = ? WHERE id = ?", counter, now(), now(), id);
  }

  async createAuthCode(input: {
    id: string;
    codeHash: string;
    appId: string;
    passkeyId: string;
    email: string;
    returnTo: string;
    expiresAt: string;
  }): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT INTO auth_codes (id, code_hash, app_id, passkey_id, email, return_to, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.codeHash,
      input.appId,
      input.passkeyId,
      input.email,
      input.returnTo,
      now(),
      input.expiresAt,
    );
  }

  async consumeAuthCode(codeHash: string, appId: string): Promise<AuthCodeRecord | null> {
    const row = this.ctx.storage.sql.exec<AuthCodeRow>("SELECT * FROM auth_codes WHERE code_hash = ? AND app_id = ?", codeHash, appId).toArray()[0];
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
    this.ctx.storage.sql.exec("UPDATE auth_codes SET consumed_at = ? WHERE id = ?", now(), row.id);
    return mapAuthCode(row);
  }

  async addAuditEvent(input: {
    id: string;
    eventType: string;
    appId?: string;
    passkeyId?: string;
    email?: string;
    ip?: string;
    userAgent?: string;
    metadata?: unknown;
  }): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT INTO audit_events (id, event_type, app_id, passkey_id, email, ip, user_agent, created_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.eventType,
      input.appId ?? null,
      input.passkeyId ?? null,
      input.email ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      now(),
      JSON.stringify(input.metadata ?? {}),
    );
  }

  async listAuditEvents(limit = 50, offset = 0): Promise<AuditEventRecord[]> {
    return this.ctx.storage.sql
      .exec<AuditRow>("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ? OFFSET ?", limit, offset)
      .toArray()
      .map(mapAudit);
  }

  async countAuditEvents(): Promise<number> {
    return this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM audit_events").toArray()[0]?.count ?? 0;
  }

  async countRecentAuditEvents(input: { eventType: string; ip?: string; since: string }): Promise<number> {
    const rows = input.ip
      ? this.ctx.storage.sql
          .exec<{ count: number }>("SELECT COUNT(*) AS count FROM audit_events WHERE event_type = ? AND ip = ? AND created_at >= ?", input.eventType, input.ip, input.since)
          .toArray()
      : this.ctx.storage.sql
          .exec<{ count: number }>("SELECT COUNT(*) AS count FROM audit_events WHERE event_type = ? AND created_at >= ?", input.eventType, input.since)
          .toArray();
    return rows[0]?.count ?? 0;
  }

  async listPasskeyUsage(): Promise<PasskeyUsageSummary[]> {
    return this.ctx.storage.sql
      .exec<PasskeyUsageRow>(
        `SELECT passkey_id, email, app_id, COUNT(*) AS total_logins, MAX(created_at) AS last_login_at
         FROM audit_events
         WHERE event_type = 'app_login_success' AND passkey_id IS NOT NULL AND app_id IS NOT NULL
         GROUP BY passkey_id, email, app_id
         ORDER BY last_login_at DESC`,
      )
      .toArray()
      .map((row) => ({ passkeyId: row.passkey_id, email: row.email, appId: row.app_id, totalLogins: row.total_logins, lastLoginAt: row.last_login_at }));
  }

  async listAppUsage(): Promise<AppUsageSummary[]> {
    return this.ctx.storage.sql
      .exec<AppUsageRow>(
        `SELECT app_id, COUNT(*) AS total_logins, COUNT(DISTINCT passkey_id) AS unique_passkeys, MAX(created_at) AS last_login_at
         FROM audit_events
         WHERE event_type = 'app_login_success' AND app_id IS NOT NULL
         GROUP BY app_id
         ORDER BY last_login_at DESC`,
      )
      .toArray()
      .map((row) => ({ appId: row.app_id, totalLogins: row.total_logins, uniquePasskeys: row.unique_passkeys, lastLoginAt: row.last_login_at }));
  }

  private initializeSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS passkeys (
        id TEXT PRIMARY KEY,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        email TEXT NOT NULL,
        label TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        app_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS challenges (
        id TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        type TEXT NOT NULL,
        context TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS enrollment_links (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        default_email TEXT,
        default_label TEXT,
        creates_admin_passkey INTEGER NOT NULL DEFAULT 0,
        app_id TEXT,
        created_by_passkey_id TEXT,
        created_via_bootstrap INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        consumed_at TEXT,
        consumed_by_passkey_id TEXT,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        session_hash TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        passkey_id TEXT,
        email TEXT,
        app_id TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS auth_codes (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL UNIQUE,
        app_id TEXT NOT NULL,
        passkey_id TEXT NOT NULL,
        email TEXT NOT NULL,
        return_to TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        app_id TEXT,
        passkey_id TEXT,
        email TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL,
        metadata TEXT NOT NULL
      );
    `);
  }
}

function mapPasskey(row: PasskeyRow): PasskeyRecord {
  return {
    id: row.id,
    credentialId: row.credential_id,
    publicKey: row.public_key,
    counter: row.counter,
    email: row.email,
    label: row.label,
    isAdmin: row.is_admin === 1,
    appId: row.app_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

function mapEnrollment(row: EnrollmentRow): EnrollmentLinkRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    defaultEmail: row.default_email,
    defaultLabel: row.default_label,
    createsAdminPasskey: row.creates_admin_passkey === 1,
    appId: row.app_id,
    createdByPasskeyId: row.created_by_passkey_id,
    createdViaBootstrap: row.created_via_bootstrap === 1,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    consumedByPasskeyId: row.consumed_by_passkey_id,
    revokedAt: row.revoked_at,
  };
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    type: row.type,
    passkeyId: row.passkey_id,
    email: row.email,
    appId: row.app_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function mapAuthCode(row: AuthCodeRow): AuthCodeRecord {
  return {
    id: row.id,
    appId: row.app_id,
    passkeyId: row.passkey_id,
    email: row.email,
    returnTo: row.return_to,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

function mapAudit(row: AuditRow): AuditEventRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    appId: row.app_id,
    passkeyId: row.passkey_id,
    email: row.email,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    metadata: row.metadata,
  };
}
