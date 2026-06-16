import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import type { ProjectState } from "./src/project-state";

const projectName = process.env.PROJECT_NAME?.trim() || "Untitled Project";
const authOrigin = process.env.AUTH_ORIGIN?.trim();
const appId = process.env.APP_ID?.trim();
const authWorkerName = process.env.AUTH_WORKER_NAME?.trim();
const workerName = process.env.WORKER_NAME?.trim() || "droplet-tasks";

export default Alchemy.Stack(
  "droplet-tasks",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const projectState = Cloudflare.DurableObjectNamespace<ProjectState>("project-state", {
      className: "ProjectState",
    });

    const env: Cloudflare.WorkerBindingProps = {
      PROJECT_NAME: projectName,
      PROJECT_STATE: projectState,
    };

    if (authOrigin && appId) {
      env.AUTH_ORIGIN = authOrigin;
      env.APP_ID = appId;
    }

    const worker = yield* Cloudflare.Worker("tasks-worker", {
      name: workerName,
      main: "./src/index.ts",
      env,
      compatibility: {
        date: "2026-06-07",
        flags: ["nodejs_compat"],
      },
      url: true,
    });

    if (authWorkerName) {
      yield* worker.bind("AUTH_SERVICE", {
        bindings: [
          {
            type: "service",
            name: "AUTH_SERVICE",
            service: authWorkerName,
          },
        ],
      });
    }

    console.log(`
Droplet Tasks deployment

Configured:
  Worker name: ${workerName}
  PROJECT_NAME: ${projectName}
  AUTH_ORIGIN: ${authOrigin ?? "not set"}
  APP_ID: ${appId ?? "not set"}
  AUTH_WORKER_NAME: ${authWorkerName ?? "not set"}

Alchemy:
  Worker URL is printed in the stack outputs after deployment completes.
`);

    return {
      worker,
      projectState,
      workerName: worker.workerName,
      workerUrl: worker.url,
    };
  }),
);
