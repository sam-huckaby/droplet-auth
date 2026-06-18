import type { ChatRoom } from "./room-object";

export interface Env {
  ROOM: DurableObjectNamespace<ChatRoom>;
  FILES: R2Bucket;
  ROOM_NAME?: string;
  PUBLIC_ORIGIN: string;
  ROOM_DESCRIPTION?: string;
  MAX_UPLOAD_BYTES?: string;
  FILE_TTL_SECONDS?: string;
  AGENT_API_KEY: string;
  AUTH_ORIGIN?: string;
  APP_ID?: string;
  DROPLET_AUTH?: Fetcher;
}

export type AuthorType = "human" | "agent" | "system";

export interface AuthorInput {
  authorId: string;
  authorName: string;
  authorType: AuthorType;
}

export interface MessageRecord {
  id: string;
  kind: "message";
  body: string;
  authorId: string;
  authorType: AuthorType;
  authorName: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  attachmentIds: string[];
  attachments: PublicAttachmentRecord[];
  replyCount: number;
}

export interface ReplyRecord {
  id: string;
  kind: "reply";
  parentMessageId: string;
  body: string;
  authorId: string;
  authorType: AuthorType;
  authorName: string;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  attachmentIds: string[];
  attachments: PublicAttachmentRecord[];
}

export interface AttachmentRecord {
  id: string;
  messageId: string | null;
  replyId: string | null;
  r2Key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedByType: "human" | "agent";
  createdAt: string;
  expiresAt: string;
  deletedAt: string | null;
}

export interface PublicAttachmentRecord {
  id: string;
  messageId: string | null;
  replyId: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedByType: "human" | "agent";
  createdAt: string;
  expiresAt: string;
  deletedAt: string | null;
}

export interface EventRecord {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  payload: unknown;
}

export interface JsonError {
  code: string;
  message: string;
}

export interface Result<T> {
  ok: boolean;
  value?: T;
  error?: JsonError;
}
