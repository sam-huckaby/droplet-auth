import { parseConfig, ConfigError, type AppConfig } from "./env";
import { requireAgentApiKey } from "./auth/agent-key";
import { authenticateHuman, type AuthContext } from "./auth/optional-auth";
import { id } from "./crypto/random";
import { chatPage } from "./html/chat";
import { jsonError, jsonOk, readJsonObject, redirect, stringField } from "./http";
import { ChatRoom } from "./room-object";
import { handleAsset } from "./routes/assets";
import type { AttachmentRecord, AuthorInput, Env, JsonError, PublicAttachmentRecord, Result } from "./types";

export { ChatRoom };

type ApiContext = { kind: "agent" } | { kind: "human"; auth: AuthContext };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const asset = handleAsset(request);
      if (asset) return asset;
      const config = parseConfig(env);
      return await route(request, env, config);
    } catch (error) {
      if (error instanceof ConfigError) return jsonError({ code: "invalid_request", message: error.message }, 500);
      console.error(JSON.stringify({ message: "request failed", error: error instanceof Error ? error.message : String(error), url: request.url }));
      return jsonError({ code: "internal_error", message: "Internal server error." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, config: AppConfig): Promise<Response> {
  const url = new URL(request.url);
  const room = env.ROOM.getByName("global");

  if (request.method === "GET" && url.pathname === "/health") return Response.json(await room.health());

  if (request.method === "GET" && url.pathname === "/ws") {
    const auth = await authenticateHuman(request, config);
    if (auth.type === "response") return auth.response;
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    return room.fetch(request);
  }

  if (request.method === "GET" && url.pathname === "/") {
    const auth = await authenticateHuman(request, config);
    if (auth.type === "response") return auth.response;
    return chatPage(config, { name: auth.context.session?.email ?? null });
  }

  const threadPageMatch = url.pathname.match(/^\/threads\/([^/]+)$/);
  if (request.method === "GET" && threadPageMatch) {
    const auth = await authenticateHuman(request, config);
    if (auth.type === "response") return auth.response;
    return chatPage(config, { name: auth.context.session?.email ?? null }, threadPageMatch[1]!);
  }

  const attachmentPageMatch = url.pathname.match(/^\/attachments\/([^/]+)$/);
  if (request.method === "GET" && attachmentPageMatch) {
    const auth = await authenticateHuman(request, config);
    if (auth.type === "response") return auth.response;
    return redirect(`/api/attachments/${encodeURIComponent(attachmentPageMatch[1]!)}/download`);
  }

  if (url.pathname.startsWith("/api/")) {
    const apiAuth = await authenticateApi(request, config);
    if (apiAuth.type === "response") return apiAuth.response;
    const csrfFailure = requireSameOriginHumanWrite(request, config, apiAuth.context);
    if (csrfFailure) return csrfFailure;
    return apiRoute(request, env, config, apiAuth.context);
  }

  return new Response("Not found", { status: 404 });
}

async function authenticateApi(request: Request, config: AppConfig): Promise<{ type: "pass"; context: ApiContext } | { type: "response"; response: Response }> {
  if (request.headers.has("authorization")) {
    const failure = await requireAgentApiKey(request, config.agentApiKey);
    if (failure) return { type: "response", response: failure };
    return { type: "pass", context: { kind: "agent" } };
  }
  const auth = await authenticateHuman(request, config);
  if (auth.type === "response") return auth;
  return { type: "pass", context: { kind: "human", auth: auth.context } };
}

function requireSameOriginHumanWrite(request: Request, config: AppConfig, context: ApiContext): Response | null {
  if (context.kind !== "human") return null;
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return null;
  const origin = request.headers.get("origin");
  if (!origin) return jsonError({ code: "forbidden", message: "Origin header is required for browser writes." }, 403);
  if (origin !== config.publicOrigin) return jsonError({ code: "forbidden", message: "Browser write origin is not allowed." }, 403);
  return null;
}

async function apiRoute(request: Request, env: Env, config: AppConfig, context: ApiContext): Promise<Response> {
  const url = new URL(request.url);
  const room = env.ROOM.getByName("global");

  if (request.method === "GET" && url.pathname === "/api/health") return Response.json(await room.health());
  if (request.method === "GET" && url.pathname === "/api/room") return jsonOk({ roomName: config.roomName, description: config.roomDescription ?? null, serverTime: new Date().toISOString() });
  if (request.method === "GET" && url.pathname === "/api/events") return jsonOk({ serverTime: new Date().toISOString(), events: await room.listEvents(url.searchParams.get("after")) });
  if (request.method === "GET" && url.pathname === "/api/messages") {
    const limit = Number(url.searchParams.get("limit") ?? "50");
    return jsonOk({ messages: await room.listMessages(Number.isFinite(limit) ? limit : 50) });
  }

  const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (request.method === "GET" && messageMatch) {
    const message = await room.getMessage(messageMatch[1]!);
    if (!message) return jsonError({ code: "not_found", message: "Message not found." }, 404);
    return jsonOk({ message });
  }

  const repliesMatch = url.pathname.match(/^\/api\/messages\/([^/]+)\/replies$/);
  if (repliesMatch && request.method === "GET") return resultJson(await room.listReplies(repliesMatch[1]!), (replies) => ({ replies }));
  if (repliesMatch && request.method === "POST") return createReply(request, room, context, repliesMatch[1]!);

  if (request.method === "POST" && url.pathname === "/api/messages") return createMessage(request, room, context);
  if (request.method === "POST" && url.pathname === "/api/attachments") return uploadAttachment(request, env, room, config, context);

  const attachmentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
  if (attachmentMatch && request.method === "GET") {
    const attachment = await room.getAttachment(attachmentMatch[1]!);
    if (!attachment) return jsonError({ code: "not_found", message: "Attachment not found." }, 404);
    return jsonOk({ attachment: publicAttachment(attachment) });
  }

  const downloadMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/download$/);
  if (downloadMatch && request.method === "GET") return downloadAttachment(env, room, downloadMatch[1]!);

  return jsonError({ code: "not_found", message: "Not found." }, 404);
}

async function createMessage(request: Request, room: DurableObjectStub<ChatRoom>, context: ApiContext): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;
  const author = authorFromBody(body.value, context);
  if (!author.ok) return jsonError(author.error!, 400);
  const text = stringField(body.value, "body");
  if (!text) return jsonError({ code: "invalid_request", message: "Message body is required." }, 400);
  return resultJson(await room.createMessage({ body: text, ...author.value! }), (message) => ({ message }));
}

async function createReply(request: Request, room: DurableObjectStub<ChatRoom>, context: ApiContext, parentMessageId: string): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;
  const author = authorFromBody(body.value, context);
  if (!author.ok) return jsonError(author.error!, 400);
  const text = stringField(body.value, "body");
  if (!text) return jsonError({ code: "invalid_request", message: "Reply body is required." }, 400);
  return resultJson(await room.createReply({ parentMessageId, body: text, ...author.value! }), (reply) => ({ reply }));
}

async function uploadAttachment(request: Request, env: Env, room: DurableObjectStub<ChatRoom>, config: AppConfig, context: ApiContext): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > config.maxUploadBytes) return jsonError({ code: "payload_too_large", message: "Upload exceeds MAX_UPLOAD_BYTES." }, 413);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError({ code: "invalid_request", message: "file is required." }, 400);
  if (file.size > config.maxUploadBytes) return jsonError({ code: "payload_too_large", message: "Upload exceeds MAX_UPLOAD_BYTES." }, 413);

  const author = authorFromForm(form, context);
  if (!author.ok) return jsonError(author.error!, 400);

  const attachmentId = id("att");
  const r2Key = attachmentKey(attachmentId, file.name);
  await env.FILES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { filename: file.name },
  });

  const result = await room.createAttachmentMetadata({
    id: attachmentId,
    messageId: formString(form, "messageId"),
    replyId: formString(form, "replyId"),
    r2Key,
    filename: file.name || "attachment",
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    uploadedById: author.value!.authorId,
    uploadedByType: author.value!.authorType === "agent" ? "agent" : "human",
    expiresAt: new Date(Date.now() + config.fileTtlSeconds * 1000).toISOString(),
  });

  if (!result.ok) {
    await env.FILES.delete(r2Key);
    return jsonError(result.error!, errorStatus(result.error!.code));
  }
  return jsonOk({ attachment: publicAttachment(result.value!) });
}

async function downloadAttachment(env: Env, room: DurableObjectStub<ChatRoom>, attachmentId: string): Promise<Response> {
  const attachment = await room.getAttachment(attachmentId);
  if (!attachment) return jsonError({ code: "not_found", message: "Attachment not found." }, 404);
  const object = await env.FILES.get(attachment.r2Key);
  if (!object) return jsonError({ code: "not_found", message: "File bytes not found." }, 404);
  return new Response(object.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "x-content-type-options": "nosniff",
      "content-length": String(object.size),
    },
  });
}

function authorFromBody(body: Record<string, unknown>, context: ApiContext): Result<AuthorInput> {
  if (context.kind === "human" && context.auth.session) {
    return { ok: true, value: { authorType: "human", authorId: context.auth.session.sub, authorName: context.auth.session.email } };
  }
  const authorId = stringField(body, "authorId");
  const authorName = stringField(body, "authorName");
  if (!authorId || !authorName) return { ok: false, error: { code: "invalid_request", message: "authorId and authorName are required." } };
  return { ok: true, value: { authorType: context.kind === "agent" ? "agent" : "human", authorId, authorName } };
}

function authorFromForm(form: FormData, context: ApiContext): Result<AuthorInput> {
  if (context.kind === "human" && context.auth.session) {
    return { ok: true, value: { authorType: "human", authorId: context.auth.session.sub, authorName: context.auth.session.email } };
  }
  const authorId = formString(form, "authorId");
  const authorName = formString(form, "authorName");
  if (!authorId || !authorName) return { ok: false, error: { code: "invalid_request", message: "authorId and authorName are required." } };
  return { ok: true, value: { authorType: context.kind === "agent" ? "agent" : "human", authorId, authorName } };
}

function formString(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resultJson<T>(result: Result<T>, shape: (value: T) => Record<string, unknown>): Response {
  if (!result.ok) return jsonError(result.error!, errorStatus(result.error!.code));
  return jsonOk(shape(result.value!));
}

function errorStatus(code: string): number {
  if (code === "unauthorized") return 401;
  if (code === "forbidden") return 403;
  if (code === "not_found") return 404;
  if (code === "payload_too_large") return 413;
  return 400;
}

function attachmentKey(attachmentId: string, filename: string): string {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const safeName = (filename || "attachment").replaceAll(/[^A-Za-z0-9._-]/g, "_").slice(0, 160) || "attachment";
  return `attachments/${year}/${month}/${day}/${attachmentId}/${safeName}`;
}

function publicAttachment(attachment: AttachmentRecord): PublicAttachmentRecord {
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
