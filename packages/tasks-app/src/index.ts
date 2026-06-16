import { parseConfig } from "./env";
import { errorResponse } from "./domain/validation";
import { authenticate, type AuthContext } from "./auth/optional-auth";
import { page } from "./html/layout";
import { homePage, newTaskPage, settingsPage, taskPage } from "./html/pages";
import { ProjectState } from "./project-state";
import type { Env, Result, Status } from "./types";
import { escapeHtml } from "./html/markdown";
import { handleAsset } from "./routes/assets";
import { createLogoutResponse } from "@whnvr/droplet/auth/worker";

export { ProjectState };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const asset = handleAsset(request);
    if (asset) return asset;

    const config = parseConfig(env);
    const auth = await authenticate(request, config);
    if (auth.type === "response") return auth.response;
    try {
      return await route(request, env, config, auth.context);
    } catch (error) {
      console.error(JSON.stringify({ message: "request failed", error: error instanceof Error ? error.message : String(error), url: request.url }));
      return Response.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error." } }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env, config: ReturnType<typeof parseConfig>, auth: AuthContext): Promise<Response> {
  const url = new URL(request.url);
  const state = env.PROJECT_STATE.getByName("global");
  const actor = auth.session?.email ?? null;

  if (request.method === "GET" && url.pathname === "/health") return Response.json(await state.health());
  if (request.method === "POST" && url.pathname === "/logout") return createLogoutResponse();

  if (url.pathname.startsWith("/api/agent/")) return agentRoute(request, state, config, actor);

  if (request.method === "GET" && url.pathname === "/") {
    return page(config.projectName, homePage(config.projectName, config.auth.enabled, await state.listRootTasks()));
  }

  if (request.method === "GET" && url.pathname === "/tasks/new") {
    return page("Create task", newTaskPage(config.projectName, config.auth.enabled, await state.listStatuses()));
  }

  if (request.method === "POST" && url.pathname === "/tasks") {
    const form = await request.formData();
    const result = await state.createTask({ parentId: stringValue(form, "parentId"), title: form.get("title"), descriptionMarkdown: form.get("descriptionMarkdown"), statusId: stringValue(form, "statusId"), actor }) as Result<any>;
    return htmlMutation(result, (task) => `/tasks/${task.id}`);
  }

  const taskMatch = url.pathname.match(/^\/tasks\/([^/]+)$/);
  if (request.method === "GET" && taskMatch) {
    const detail = await state.getTaskDetail(taskMatch[1]!) as Result<any>;
    if (!detail.ok) return page("Not found", `<h1>Not found</h1><p>${detail.error?.message}</p>`);
    return page(detail.value.task.title, taskPage(config.projectName, config.auth.enabled, detail.value));
  }

  if (request.method === "POST" && taskMatch) {
    const form = await request.formData();
    const result = await state.updateTask(taskMatch[1]!, { title: form.get("title"), descriptionMarkdown: form.get("descriptionMarkdown"), statusId: stringValue(form, "statusId") ?? undefined, parentId: stringValue(form, "parentId"), actor }) as Result<any>;
    return htmlMutation(result, () => `/tasks/${taskMatch[1]}`);
  }

  const statusMatch = url.pathname.match(/^\/tasks\/([^/]+)\/status$/);
  if (request.method === "POST" && statusMatch) {
    const form = await request.formData();
    const result = await state.updateTask(statusMatch[1]!, { statusId: stringValue(form, "statusId") ?? undefined, actor }) as Result<any>;
    if (!result.ok && result.error?.code === "TERMINAL_STATE_BLOCKED") {
      const detail = await state.getTaskDetail(statusMatch[1]!) as Result<any>;
      if (detail.ok) {
        const blocker = result.error.blockingTask;
        const blockerHtml = blocker ? ` Deepest incomplete task: <a href="${escapeHtml(blocker.url)}">${escapeHtml(blocker.title)}</a>` : "";
        return page("Task blocked", taskPage(config.projectName, config.auth.enabled, detail.value, `${escapeHtml(result.error.message)}${blockerHtml}`));
      }
    }
    return htmlMutation(result, () => `/tasks/${statusMatch[1]}`);
  }

  const noteMatch = url.pathname.match(/^\/tasks\/([^/]+)\/notes$/);
  if (request.method === "POST" && noteMatch) {
    const form = await request.formData();
    const result = await state.appendNote(noteMatch[1]!, { bodyMarkdown: form.get("bodyMarkdown"), actor }) as Result<any>;
    return htmlMutation(result, () => `/tasks/${noteMatch[1]}`);
  }

  const childMatch = url.pathname.match(/^\/tasks\/([^/]+)\/children$/);
  if (request.method === "POST" && childMatch) {
    const form = await request.formData();
    const result = await state.createTask({ parentId: childMatch[1]!, title: form.get("title"), descriptionMarkdown: form.get("descriptionMarkdown"), statusId: stringValue(form, "statusId"), actor }) as Result<any>;
    return htmlMutation(result, (task) => `/tasks/${task.id}`);
  }

  if (request.method === "GET" && url.pathname === "/settings") {
    return page("Settings", settingsPage(config.projectName, config.auth.enabled, config.auth.enabled ? config.auth.appId : undefined, await state.listStatuses()));
  }

  if (request.method === "POST" && url.pathname === "/settings/statuses") {
    const form = await request.formData();
    const result = await state.createStatus({ name: form.get("name"), kind: form.get("kind"), color: form.get("color"), isDefault: form.get("isDefault") === "true" }) as Result<any>;
    if (wantsJson(request)) return jsonResult(result);
    return settingsMutation(result);
  }

  const editStatusMatch = url.pathname.match(/^\/settings\/statuses\/([^/]+)$/);
  if (request.method === "POST" && editStatusMatch) {
    const form = await request.formData();
    const result = await state.updateStatus(editStatusMatch[1]!, { name: form.get("name"), kind: form.get("kind"), color: form.get("color"), isDefault: form.get("isDefault") === "true" }) as Result<any>;
    if (wantsJson(request)) return jsonResult(result);
    return settingsMutation(result);
  }

  const deleteStatusMatch = url.pathname.match(/^\/settings\/statuses\/([^/]+)\/delete$/);
  if (request.method === "POST" && deleteStatusMatch) {
    const result = await state.deleteStatus(deleteStatusMatch[1]!) as Result<any>;
    if (wantsJson(request)) return jsonResult(result);
    return settingsMutation(result);
  }

  return new Response("Not found", { status: 404 });
}

async function agentRoute(request: Request, state: DurableObjectStub<ProjectState>, config: ReturnType<typeof parseConfig>, actor: string | null): Promise<Response> {
  const url = new URL(request.url);
  const taskMatch = url.pathname.match(/^\/api\/agent\/tasks\/([^/]+)$/);
  const noteMatch = url.pathname.match(/^\/api\/agent\/tasks\/([^/]+)\/notes$/);

  if (request.method === "GET" && url.pathname === "/api/agent/project") return Response.json(await state.projectSummary(config.projectName, config.auth.enabled));
  if (request.method === "GET" && url.pathname === "/api/agent/tree") return Response.json(await state.fullTree());
  if (request.method === "GET" && url.pathname === "/api/agent/statuses") return Response.json({ statuses: await state.listStatuses() });
  if (request.method === "GET" && url.pathname === "/api/agent/tasks") return Response.json({ tasks: await state.listTasksByStatus(url.searchParams.get("status") ?? undefined) });
  if (request.method === "GET" && taskMatch) return jsonResult(await state.getTaskDetail(taskMatch[1]!));
  if (request.method === "POST" && url.pathname === "/api/agent/tasks") {
    const body = await readJson(request);
    if (!body.ok) return errorResponse(body.error ?? { code: "VALIDATION_ERROR", message: "Invalid JSON body." }, 400);
    const value = body.value ?? {};
    return jsonResult(await state.createTask({ parentId: value.parentId as string | null | undefined, title: value.title, descriptionMarkdown: value.descriptionMarkdown, statusId: value.statusId as string | null | undefined, actor }) as Result<any>);
  }
  if (request.method === "PATCH" && taskMatch) {
    const body = await readJson(request);
    if (!body.ok) return errorResponse(body.error ?? { code: "VALIDATION_ERROR", message: "Invalid JSON body." }, 400);
    const value = body.value ?? {};
    return jsonResult(await state.updateTask(taskMatch[1]!, { title: value.title, descriptionMarkdown: value.descriptionMarkdown, statusId: value.statusId as string | undefined, parentId: value.parentId as string | null | undefined, actor }) as Result<any>);
  }
  if (request.method === "POST" && noteMatch) {
    const body = await readJson(request);
    if (!body.ok) return errorResponse(body.error ?? { code: "VALIDATION_ERROR", message: "Invalid JSON body." }, 400);
    const value = body.value ?? {};
    return jsonResult(await state.appendNote(noteMatch[1]!, { bodyMarkdown: value.bodyMarkdown, actor }) as Result<any>);
  }
  return Response.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
}

async function readJson(request: Request): Promise<Result<Record<string, unknown>>> {
  if (!request.headers.get("content-type")?.includes("application/json")) return { ok: true, value: {} };
  try {
    const body = await request.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) return { ok: true, value: body as Record<string, unknown> };
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "JSON body must be an object." } };
  } catch {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Request body contains invalid JSON." } };
  }
}

function jsonResult<T>(result: Result<T>): Response {
  if (!result.ok) return errorResponse(result.error!, result.error?.code === "NOT_FOUND" ? 404 : 400);
  return Response.json({ ok: true, result: result.value });
}

function htmlMutation<T>(result: Result<T>, location: (value: T) => string): Response {
  if (!result.ok) return page("Error", `<h1>Error</h1><p>${escapeHtml(result.error?.message ?? "Unknown error")}</p><p><a href="/">Home</a></p>`);
  return redirect(location(result.value!));
}

function settingsMutation(result: Result<unknown>): Response {
  if (!result.ok) return page("Settings error", `<h1>Settings error</h1><p>${escapeHtml(result.error?.message ?? "Unknown error")}</p><p><a href="/settings">Back to settings</a></p>`);
  return redirect("/settings");
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

function wantsJson(request: Request): boolean {
  return request.headers.get("accept")?.includes("application/json") ?? false;
}

function stringValue(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
