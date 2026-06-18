import { DurableObject } from "cloudflare:workers";
import { id } from "./crypto/random";
import type { AttachmentRecord, AuthorInput, Env, EventRecord, MessageRecord, PublicAttachmentRecord, ReplyRecord, Result } from "./types";

type MessageRow = {
  id: string;
  body: string;
  author_id: string;
  author_type: "human" | "agent" | "system";
  author_name: string;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

type ReplyRow = MessageRow & {
  parent_message_id: string;
};

type AttachmentRow = {
  id: string;
  message_id: string | null;
  reply_id: string | null;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_id: string;
  uploaded_by_type: "human" | "agent";
  created_at: string;
  expires_at: string;
  deleted_at: string | null;
};

type EventRow = {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  payload: string;
};

export class ChatRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.initializeSchema();
    });
  }

  async health(): Promise<{ ok: true }> {
    this.ctx.storage.sql.exec("SELECT 1");
    return { ok: true };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  async listMessages(limit = 50): Promise<MessageRecord[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const rows = this.ctx.storage.sql.exec<MessageRow>("SELECT * FROM messages WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ?", safeLimit).toArray().reverse();
    return rows.map((row) => this.mapMessage(row));
  }

  async getMessage(messageId: string): Promise<MessageRecord | null> {
    const row = this.ctx.storage.sql.exec<MessageRow>("SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL", messageId).toArray()[0];
    return row ? this.mapMessage(row) : null;
  }

  async createMessage(input: { body: string } & AuthorInput): Promise<Result<MessageRecord>> {
    const validation = validateBody(input.body);
    if (validation) return { ok: false, error: validation };

    const createdAt = now();
    const messageId = id("msg");
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, body, author_id, author_type, author_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      messageId,
      input.body,
      input.authorId,
      input.authorType,
      input.authorName,
      createdAt,
    );

    const message = (await this.getMessage(messageId))!;
    this.createEvent("message.created", "message", message.id, message);
    return { ok: true, value: message };
  }

  async listReplies(messageId: string): Promise<Result<ReplyRecord[]>> {
    const parent = await this.getMessage(messageId);
    if (!parent) return { ok: false, error: { code: "not_found", message: "Message not found." } };
    const rows = this.ctx.storage.sql.exec<ReplyRow>("SELECT * FROM thread_replies WHERE parent_message_id = ? AND deleted_at IS NULL ORDER BY created_at ASC, id ASC", messageId).toArray();
    return { ok: true, value: rows.map((row) => this.mapReply(row)) };
  }

  async createReply(input: { parentMessageId: string; body: string } & AuthorInput): Promise<Result<ReplyRecord>> {
    const validation = validateBody(input.body);
    if (validation) return { ok: false, error: validation };

    const parent = await this.getMessage(input.parentMessageId);
    if (!parent) {
      const replyParent = this.ctx.storage.sql.exec<ReplyRow>("SELECT * FROM thread_replies WHERE id = ? AND deleted_at IS NULL", input.parentMessageId).toArray()[0];
      if (replyParent) return { ok: false, error: { code: "thread_nesting_not_allowed", message: "Threads cannot be created inside threads." } };
      return { ok: false, error: { code: "not_found", message: "Parent message not found." } };
    }

    const createdAt = now();
    const replyId = id("reply");
    this.ctx.storage.sql.exec(
      `INSERT INTO thread_replies (id, parent_message_id, body, author_id, author_type, author_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      replyId,
      input.parentMessageId,
      input.body,
      input.authorId,
      input.authorType,
      input.authorName,
      createdAt,
    );

    const row = this.ctx.storage.sql.exec<ReplyRow>("SELECT * FROM thread_replies WHERE id = ?", replyId).toArray()[0]!;
    const reply = this.mapReply(row);
    this.createEvent("reply.created", "reply", reply.id, reply);
    return { ok: true, value: reply };
  }

  async listEvents(after?: string | null): Promise<EventRecord[]> {
    const afterValue = after?.trim();
    if (afterValue) {
      return this.ctx.storage.sql.exec<EventRow>("SELECT * FROM events WHERE created_at > ? ORDER BY created_at ASC, id ASC", afterValue).toArray().map(mapEvent);
    }
    return this.ctx.storage.sql.exec<EventRow>("SELECT * FROM events ORDER BY created_at ASC, id ASC LIMIT 200").toArray().map(mapEvent);
  }

  async createAttachmentMetadata(input: {
    id: string;
    messageId?: string | null;
    replyId?: string | null;
    r2Key: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    uploadedById: string;
    uploadedByType: "human" | "agent";
    expiresAt: string;
  }): Promise<Result<AttachmentRecord>> {
    const messageId = input.messageId || null;
    const replyId = input.replyId || null;
    if (messageId && replyId) return { ok: false, error: { code: "invalid_request", message: "Attachment cannot target both a message and a reply." } };
    if (messageId && !(await this.getMessage(messageId))) return { ok: false, error: { code: "not_found", message: "Message not found." } };
    if (replyId && !this.replyExists(replyId)) return { ok: false, error: { code: "not_found", message: "Reply not found." } };

    const createdAt = now();
    this.ctx.storage.sql.exec(
      `INSERT INTO attachments (id, message_id, reply_id, r2_key, filename, content_type, size_bytes, uploaded_by_id, uploaded_by_type, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      messageId,
      replyId,
      input.r2Key,
      input.filename,
      input.contentType,
      input.sizeBytes,
      input.uploadedById,
      input.uploadedByType,
      createdAt,
      input.expiresAt,
    );

    const attachment = (await this.getAttachment(input.id))!;
    this.createEvent("attachment.created", "attachment", attachment.id, toPublicAttachment(attachment));
    return { ok: true, value: attachment };
  }

  async getAttachment(attachmentId: string): Promise<AttachmentRecord | null> {
    const row = this.ctx.storage.sql.exec<AttachmentRow>("SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL", attachmentId).toArray()[0];
    if (row && isExpired(row.expires_at)) return null;
    return row ? mapAttachment(row) : null;
  }

  private createEvent(type: string, entityType: string, entityId: string, payload: unknown): EventRecord {
    const event: EventRecord = { id: id("evt"), type, entityType, entityId, createdAt: now(), payload };
    this.ctx.storage.sql.exec(
      "INSERT INTO events (id, event_type, entity_type, entity_id, created_at, payload) VALUES (?, ?, ?, ?, ?, ?)",
      event.id,
      event.type,
      event.entityType,
      event.entityId,
      event.createdAt,
      JSON.stringify(event.payload),
    );
    this.broadcast(event);
    return event;
  }

  private broadcast(event: EventRecord): void {
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        socket.close(1011, "Unable to send event");
      }
    }
  }

  private mapMessage(row: MessageRow): MessageRecord {
    const attachments = this.listPublicAttachments("message_id", row.id);
    const attachmentIds = attachments.map((item) => item.id);
    const replyCount = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM thread_replies WHERE parent_message_id = ? AND deleted_at IS NULL", row.id).toArray()[0]?.count ?? 0;
    return {
      id: row.id,
      kind: "message",
      body: row.body,
      authorId: row.author_id,
      authorType: row.author_type,
      authorName: row.author_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      attachmentIds,
      attachments,
      replyCount,
    };
  }

  private mapReply(row: ReplyRow): ReplyRecord {
    const attachments = this.listPublicAttachments("reply_id", row.id);
    const attachmentIds = attachments.map((item) => item.id);
    return {
      id: row.id,
      kind: "reply",
      parentMessageId: row.parent_message_id,
      body: row.body,
      authorId: row.author_id,
      authorType: row.author_type,
      authorName: row.author_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      attachmentIds,
      attachments,
    };
  }

  private listPublicAttachments(column: "message_id" | "reply_id", idValue: string): PublicAttachmentRecord[] {
    return this.ctx.storage.sql
      .exec<AttachmentRow>(`SELECT * FROM attachments WHERE ${column} = ? AND deleted_at IS NULL AND expires_at > ? ORDER BY created_at ASC, id ASC`, idValue, now())
      .toArray()
      .map(publicAttachment);
  }

  private replyExists(replyId: string): boolean {
    return Boolean(this.ctx.storage.sql.exec<{ id: string }>("SELECT id FROM thread_replies WHERE id = ? AND deleted_at IS NULL", replyId).toArray()[0]);
  }

  private initializeSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_type TEXT NOT NULL,
        author_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at);

      CREATE TABLE IF NOT EXISTS thread_replies (
        id TEXT PRIMARY KEY,
        parent_message_id TEXT NOT NULL,
        body TEXT NOT NULL,
        author_id TEXT NOT NULL,
        author_type TEXT NOT NULL,
        author_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT,
        FOREIGN KEY (parent_message_id) REFERENCES messages(id)
      );
      CREATE INDEX IF NOT EXISTS idx_thread_replies_parent ON thread_replies (parent_message_id);
      CREATE INDEX IF NOT EXISTS idx_thread_replies_created_at ON thread_replies (created_at);

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT,
        reply_id TEXT,
        r2_key TEXT NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        uploaded_by_id TEXT NOT NULL,
        uploaded_by_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (message_id) REFERENCES messages(id),
        FOREIGN KEY (reply_id) REFERENCES thread_replies(id)
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments (message_id);
      CREATE INDEX IF NOT EXISTS idx_attachments_reply ON attachments (reply_id);

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
    `);
    try {
      this.ctx.storage.sql.exec("ALTER TABLE attachments ADD COLUMN expires_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z'");
    } catch {
      // Column already exists. This project is beta, so old attachment rows expire by default.
    }
  }
}

function now(): string {
  return new Date().toISOString();
}

function validateBody(body: string): { code: string; message: string } | null {
  if (!body.trim()) return { code: "invalid_request", message: "Message body is required." };
  if (body.length > 100_000) return { code: "invalid_request", message: "Message body is too long." };
  return null;
}

function mapAttachment(row: AttachmentRow): AttachmentRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    replyId: row.reply_id,
    r2Key: row.r2_key,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedById: row.uploaded_by_id,
    uploadedByType: row.uploaded_by_type,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
  };
}

function publicAttachment(row: AttachmentRow): PublicAttachmentRecord {
  return {
    id: row.id,
    messageId: row.message_id,
    replyId: row.reply_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedById: row.uploaded_by_id,
    uploadedByType: row.uploaded_by_type,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    deletedAt: row.deleted_at,
  };
}

function toPublicAttachment(attachment: AttachmentRecord): PublicAttachmentRecord {
  return {
    id: attachment.id,
    messageId: attachment.messageId,
    replyId: attachment.replyId,
    filename: attachment.filename,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    uploadedById: attachment.uploadedById,
    uploadedByType: attachment.uploadedByType,
    createdAt: attachment.createdAt,
    expiresAt: attachment.expiresAt,
    deletedAt: attachment.deletedAt,
  };
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

function mapEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    type: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: row.created_at,
    payload: JSON.parse(row.payload) as unknown,
  };
}
