import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import type { ChatRoom } from "./src/room-object";

const workerName = process.env.WORKER_NAME?.trim() || "droplet-chat";
const roomName = process.env.ROOM_NAME?.trim() || "droplet-chat";
const roomDescription = process.env.ROOM_DESCRIPTION?.trim();
const publicOrigin = requireEnv("PUBLIC_ORIGIN");
const maxUploadBytes = process.env.MAX_UPLOAD_BYTES?.trim() || "1073741824";
const fileTtlSeconds = parsePositiveInteger(process.env.FILE_TTL_SECONDS?.trim() || "604800", "FILE_TTL_SECONDS");
const authOrigin = process.env.AUTH_ORIGIN?.trim();
const appId = process.env.APP_ID?.trim();
const authWorkerName = process.env.AUTH_WORKER_NAME?.trim();

if (authOrigin && appId && !authWorkerName) {
  throw new Error("AUTH_WORKER_NAME is required when AUTH_ORIGIN and APP_ID enable droplet-auth");
}

export default Alchemy.Stack(
  "droplet-chat",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const room = Cloudflare.DurableObjectNamespace<ChatRoom>("chat-room", {
      className: "ChatRoom",
    });

    const files = yield* Cloudflare.R2Bucket("droplet-chat-files", {
      name: `${workerName}-files`,
      lifecycleRules: [
        {
          id: "delete-attachments-after-ttl",
          prefix: "attachments/",
          enabled: true,
          deleteObjectsTransition: { condition: { type: "Age", maxAge: fileTtlSeconds } },
          abortMultipartUploadsTransition: { condition: { type: "Age", maxAge: Math.min(fileTtlSeconds, 86400) } },
        },
      ],
    });

    const env: Cloudflare.WorkerBindingProps = {
      ROOM: room,
      FILES: files,
      ROOM_NAME: roomName,
      PUBLIC_ORIGIN: publicOrigin,
      MAX_UPLOAD_BYTES: maxUploadBytes,
      FILE_TTL_SECONDS: String(fileTtlSeconds),
    };

    if (roomDescription) env.ROOM_DESCRIPTION = roomDescription;
    if (authOrigin && appId) {
      env.AUTH_ORIGIN = authOrigin;
      env.APP_ID = appId;
    }

    const worker = yield* Cloudflare.Worker("droplet-chat-worker", {
      name: workerName,
      main: "./src/index.ts",
      env,
      compatibility: {
        date: "2026-06-08",
        flags: ["nodejs_compat"],
      },
      url: true,
    });

    yield* worker.bind("AGENT_API_KEY", {
      bindings: [{ type: "secret_text", name: "AGENT_API_KEY", text: requireSecret("AGENT_API_KEY") }],
    });

    if (authWorkerName) {
      yield* worker.bind("DROPLET_AUTH", {
        bindings: [
          {
            type: "service",
            name: "DROPLET_AUTH",
            service: authWorkerName,
          },
        ],
      });
    }

    console.log(`
droplet-chat deployment

Configured:
  Worker name: ${workerName}
  ROOM_NAME: ${roomName}
  PUBLIC_ORIGIN: ${publicOrigin}
  MAX_UPLOAD_BYTES: ${maxUploadBytes}
  FILE_TTL_SECONDS: ${fileTtlSeconds}
  AUTH_ORIGIN: ${authOrigin ?? "not set"}
  APP_ID: ${appId ?? "not set"}
  AUTH_WORKER_NAME: ${authWorkerName ?? "not set"}

Alchemy:
  Worker URL is printed in the stack outputs after deployment completes.
`);

    return {
      worker,
      room,
      files,
      workerName: worker.workerName,
      workerUrl: worker.url,
    };
  }),
);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requireSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePositiveInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive safe integer`);
  return parsed;
}
