import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { AttachmentRecord, Env, MessageRecord } from "../src/types";

const apiKey = "droplet_agent_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

describe("dual-purpose /api auth boundary", () => {
  it("allows human-style API reads without bearer when human auth is disabled", async () => {
    const env = testEnv();
    const response = await worker.fetch(new Request("https://chat.example.com/api/messages"), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, messages: [] });
  });

  it("rejects human-style API writes without same-origin Origin", async () => {
    const env = testEnv();
    const response = await worker.fetch(
      new Request("https://chat.example.com/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "hello", authorId: "human", authorName: "Human" }),
      }),
      env,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("allows human-style API writes with same-origin Origin", async () => {
    const env = testEnv();
    const response = await worker.fetch(
      new Request("https://chat.example.com/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://chat.example.com" },
        body: JSON.stringify({ body: "hello", authorId: "human", authorName: "Human" }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, message: { id: "msg_test" } });
  });

  it("allows bearer-token agent writes without Origin", async () => {
    const env = testEnv();
    const response = await worker.fetch(
      new Request("https://chat.example.com/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ body: "hello", authorId: "agent", authorName: "Agent" }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, message: { authorType: "agent" } });
  });

  it("rejects protected human-style API requests without a session", async () => {
    const env = testEnv({ AUTH_ORIGIN: "https://auth.example.com", APP_ID: "chat", DROPLET_AUTH: { fetch: vi.fn() } as unknown as Fetcher });
    const response = await worker.fetch(new Request("https://chat.example.com/api/messages"), env);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "unauthorized" } });
  });
});

describe("attachment upload API", () => {
  it("uses one attachment ID for R2 key, metadata, and response without exposing r2Key", async () => {
    const put = vi.fn(async () => undefined);
    const room = testRoom();
    const createAttachmentMetadata = vi.fn(async (input: any) => {
      expect(input.r2Key).toContain(input.id);
      return {
        ok: true,
        value: {
          id: input.id,
          messageId: input.messageId,
          replyId: input.replyId,
          r2Key: input.r2Key,
          filename: input.filename,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          uploadedById: input.uploadedById,
          uploadedByType: input.uploadedByType,
          createdAt: "2026-06-08T00:00:00.000Z",
          expiresAt: input.expiresAt,
          deletedAt: null,
        } satisfies AttachmentRecord,
      };
    });
    room.createAttachmentMetadata = createAttachmentMetadata;
    const env = testEnv({ FILES: { put, delete: vi.fn() } as unknown as R2Bucket, ROOM: namespaceFor(room) });

    const form = new FormData();
    form.set("file", new File(["hello"], "notes.txt", { type: "text/plain" }));
    form.set("messageId", "msg_test");
    form.set("authorId", "agent");
    form.set("authorName", "Agent");

    const response = await worker.fetch(new Request("https://chat.example.com/api/attachments", { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form }), env);
    expect(response.status).toBe(200);
    const json = (await response.json()) as any;
    expect(json.ok).toBe(true);
    expect(json.attachment.id).toMatch(/^att_/);
    expect(json.attachment.expiresAt).toEqual(expect.any(String));
    expect(json.attachment.r2Key).toBeUndefined();
    expect(createAttachmentMetadata.mock.calls[0][0].expiresAt).toEqual(expect.any(String));
    expect(put).toHaveBeenCalledOnce();
    expect(createAttachmentMetadata).toHaveBeenCalledOnce();
  });

  it("returns 404 for expired attachment detail", async () => {
    const room = testRoom();
    room.getAttachment = vi.fn(async () => null);
    const response = await worker.fetch(new Request("https://chat.example.com/api/attachments/att_expired", { headers: { authorization: `Bearer ${apiKey}` } }), testEnv({ ROOM: namespaceFor(room) }));
    expect(response.status).toBe(404);
  });

  it("returns 404 for expired attachment downloads", async () => {
    const room = testRoom();
    room.getAttachment = vi.fn(async () => null);
    const response = await worker.fetch(new Request("https://chat.example.com/api/attachments/att_expired/download", { headers: { authorization: `Bearer ${apiKey}` } }), testEnv({ ROOM: namespaceFor(room) }));
    expect(response.status).toBe(404);
  });
});

describe("API room contract behavior", () => {
  it("returns thread_nesting_not_allowed from reply creation", async () => {
    const room = testRoom();
    room.createReply = vi.fn(async () => ({ ok: false, error: { code: "thread_nesting_not_allowed", message: "Threads cannot be created inside threads." } }));
    const env = testEnv({ ROOM: namespaceFor(room) });
    const response = await worker.fetch(
      new Request("https://chat.example.com/api/messages/reply_parent/replies", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ body: "nested", authorId: "agent", authorName: "Agent" }),
      }),
      env,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "thread_nesting_not_allowed" } });
  });

  it("passes after cursor to event listing and includes server time", async () => {
    const room = testRoom();
    room.listEvents = vi.fn(async () => [{ id: "evt_1", type: "message.created", entityType: "message", entityId: "msg_1", createdAt: "2026-06-08T00:00:00.000Z", payload: {} }]);
    const env = testEnv({ ROOM: namespaceFor(room) });
    const response = await worker.fetch(new Request("https://chat.example.com/api/events?after=2026-01-01T00:00:00.000Z", { headers: { authorization: `Bearer ${apiKey}` } }), env);
    expect(response.status).toBe(200);
    expect(room.listEvents).toHaveBeenCalledWith("2026-01-01T00:00:00.000Z");
    const json = (await response.json()) as any;
    expect(json.serverTime).toEqual(expect.any(String));
    expect(json.events).toHaveLength(1);
  });

  it("returns public attachment metadata with messages", async () => {
    const room = testRoom();
    room.listMessages = vi.fn(async () => [
      {
        id: "msg_1",
        kind: "message",
        body: "with file",
        authorId: "agent",
        authorType: "agent",
        authorName: "Agent",
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: null,
        deletedAt: null,
        attachmentIds: ["att_1"],
        attachments: [{ id: "att_1", messageId: "msg_1", replyId: null, filename: "notes.txt", contentType: "text/plain", sizeBytes: 5, uploadedById: "agent", uploadedByType: "agent", createdAt: "2026-06-08T00:00:00.000Z", expiresAt: "2026-06-15T00:00:00.000Z", deletedAt: null }],
        replyCount: 0,
      },
    ]);
    const env = testEnv({ ROOM: namespaceFor(room) });
    const response = await worker.fetch(new Request("https://chat.example.com/api/messages", { headers: { authorization: `Bearer ${apiKey}` } }), env);
    const json = (await response.json()) as any;
    expect(json.messages[0].attachments[0].filename).toBe("notes.txt");
    expect(json.messages[0].attachments[0].r2Key).toBeUndefined();
  });
});

describe("thread page route", () => {
  it("renders a thread URL when human auth is disabled", async () => {
    const response = await worker.fetch(new Request("https://chat.example.com/threads/msg_1"), testEnv());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toContain("msg_1");
  });

  it("redirects thread URLs through droplet-auth when human auth is enabled", async () => {
    const env = testEnv({ AUTH_ORIGIN: "https://auth.example.com", APP_ID: "chat", DROPLET_AUTH: { fetch: vi.fn() } as unknown as Fetcher });
    const response = await worker.fetch(new Request("https://chat.example.com/threads/msg_1"), env);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("https://auth.example.com/login");
  });
});

function testEnv(overrides: Record<string, unknown> = {}): Env {
  const env = {
    ROOM: namespaceFor(testRoom()),
    FILES: { put: vi.fn(), get: vi.fn(), delete: vi.fn() } as unknown as R2Bucket,
    PUBLIC_ORIGIN: "https://chat.example.com",
    ROOM_NAME: "droplet-chat",
    AGENT_API_KEY: apiKey,
    ...overrides,
  };
  return env as Env;
}

function namespaceFor(room: any): DurableObjectNamespace<any> {
  return { getByName: () => room } as unknown as DurableObjectNamespace<any>;
}

function testRoom(): any {
  const message: MessageRecord = {
    id: "msg_test",
    kind: "message",
    body: "hello",
    authorId: "actor",
    authorType: "agent",
    authorName: "Actor",
    createdAt: "2026-06-08T00:00:00.000Z",
    updatedAt: null,
    deletedAt: null,
    attachmentIds: [],
    attachments: [],
    replyCount: 0,
  };
  return {
    health: vi.fn(async () => ({ ok: true })),
    listMessages: vi.fn(async () => []),
    createMessage: vi.fn(async (input: any) => ({ ok: true, value: { ...message, ...input } })),
    listEvents: vi.fn(async () => []),
    getMessage: vi.fn(async () => message),
    listReplies: vi.fn(async () => ({ ok: true, value: [] })),
    createReply: vi.fn(async () => ({ ok: true, value: null })),
    getAttachment: vi.fn(async () => null),
    createAttachmentMetadata: vi.fn(async () => ({ ok: false, error: { code: "not_found", message: "not found" } })),
    fetch: vi.fn(),
  };
}
