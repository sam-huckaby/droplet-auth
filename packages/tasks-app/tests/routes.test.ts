import { describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env, Result, Status } from "../src/types";
import { settingsPage } from "../src/html/pages";

const statuses: Status[] = [
  { id: "backlog", name: "Backlog", kind: "open", sortOrder: 10, color: "#64748b", isDefault: true },
  { id: "done", name: "Done", kind: "terminal", sortOrder: 20, color: "#7c3aed", isDefault: false },
];

function env(overrides: Partial<Env> = {}, stateOverrides: Record<string, unknown> = {}): Env {
  const state = {
    health: async () => ({ ok: true }),
    listRootTasks: async () => [],
    listStatuses: async () => statuses,
    projectSummary: async (projectName: string, authEnabled: boolean) => ({ project: { name: projectName, authEnabled }, statuses, counts: { totalTasks: 0, terminalTasks: 0, nonTerminalTasks: 0 } }),
    fullTree: async () => ({ rootTasks: [] }),
    listTasksByStatus: async () => [],
    createTask: async (): Promise<Result<{ id: string }>> => ({ ok: true, value: { id: "task_1" } }),
    updateTask: async (): Promise<Result<{ id: string }>> => ({ ok: true, value: { id: "task_1" } }),
    appendNote: async (): Promise<Result<{ id: string }>> => ({ ok: true, value: { id: "note_1" } }),
    createStatus: async (): Promise<Result<{ id: string }>> => ({ ok: true, value: { id: "status_1" } }),
    updateStatus: async (): Promise<Result<{ id: string }>> => ({ ok: true, value: { id: "done" } }),
    deleteStatus: async (): Promise<Result<{ deleted: true }>> => ({ ok: true, value: { deleted: true } }),
    getTaskDetail: async (): Promise<Result<unknown>> => ({ ok: false, error: { code: "NOT_FOUND", message: "Task not found." } }),
    ...stateOverrides,
  };
  return {
    PROJECT_NAME: "Manual Test Project",
    PROJECT_STATE: { getByName: () => state } as unknown as Env["PROJECT_STATE"],
    ...overrides,
  };
}

describe("worker routes", () => {
  it("serves HTML when auth is disabled", async () => {
    const response = await worker.fetch(new Request("https://tasks.example.com/"), env());
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Manual Test Project");
    expect(html).not.toContain('action="/logout"');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest">');
    expect(html).toContain('<link rel="shortcut icon" href="/favicon.ico">');
  });

  it("serves favicon assets with content types", async () => {
    const ico = await worker.fetch(new Request("https://tasks.example.com/favicon.ico"), env());
    expect(ico.status).toBe(200);
    expect(ico.headers.get("content-type")).toBe("image/x-icon");
    expect(ico.headers.get("cache-control")).toContain("immutable");

    const png = await worker.fetch(new Request("https://tasks.example.com/favicon-32x32.png"), env());
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
  });

  it("serves the web manifest", async () => {
    const response = await worker.fetch(new Request("https://tasks.example.com/site.webmanifest"), env());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    await expect(response.json()).resolves.toMatchObject({ name: "Droplet Tasks", short_name: "Tasks" });
  });

  it("serves favicon assets before auth", async () => {
    const response = await worker.fetch(new Request("https://tasks.example.com/favicon.ico"), env({ AUTH_ORIGIN: "https://auth.example.com", APP_ID: "tasks" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/x-icon");
  });

  it("returns 401 for unauthenticated agent API when auth is enabled", async () => {
    const response = await worker.fetch(new Request("https://tasks.example.com/api/agent/project", { headers: { accept: "application/json" } }), env({ AUTH_ORIGIN: "https://auth.example.com", APP_ID: "tasks" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
  });

  it("redirects unauthenticated HTML requests when auth is enabled", async () => {
    const response = await worker.fetch(new Request("https://tasks.example.com/"), env({ AUTH_ORIGIN: "https://auth.example.com", APP_ID: "tasks" }));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("https://auth.example.com/login");
  });

  it("clears the app session on logout", async () => {
    const response = await worker.fetch(new Request("https://tasks.example.com/logout", { method: "POST" }), env());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toContain("da_session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns validation errors for invalid JSON", async () => {
    const response = await worker.fetch(new Request("https://tasks.example.com/api/agent/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), env());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("wraps agent mutation success responses", async () => {
    const response = await worker.fetch(new Request("https://tasks.example.com/api/agent/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Task" }) }), env());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, result: { id: "task_1" } });
  });

  it("renders settings statuses as inline-edit rows with actions", async () => {
    const response = await worker.fetch(new Request("https://tasks.example.com/settings"), env());
    const html = await response.text();
    expect(html).toContain("Add status");
    expect(html).toContain("<th>Color</th>");
    expect(html).toContain("<th>Actions</th>");
    expect(html).not.toContain("<th>Edit</th>");
    expect(html).toContain("settings-status-row");
    expect(html).toContain("type=\"color\"");
    expect(html).toContain("name=\"color\" value=\"#2563eb\"");
    expect(html).toContain("data-update-url=\"/settings/statuses/backlog\"");
    expect(html).not.toContain("/settings/statuses/backlog/delete");
    expect(html).toContain("/settings/statuses/done/delete");
    expect(html).not.toContain("Create status</h2>");
  });

  it("renders logout in the header when auth is enabled", () => {
    const html = settingsPage("Manual Test Project", true, "tasks", statuses);
    expect(html).toContain('method="post" action="/logout"');
    expect(html).toContain("Log out");
  });

  it("returns JSON for settings inline status updates", async () => {
    let input: any;
    const form = new FormData();
    form.set("name", "Done");
    form.set("kind", "terminal");
    form.set("color", "#123abc");
    const response = await worker.fetch(new Request("https://tasks.example.com/settings/statuses/done", { method: "POST", headers: { accept: "application/json" }, body: form }), env({}, {
      updateStatus: async (_id: string, value: unknown): Promise<Result<{ id: string }>> => {
        input = value;
        return { ok: true, value: { id: "done" } };
      },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, result: { id: "done" } });
    expect(input.color).toBe("#123abc");
  });

  it("passes color through status creation", async () => {
    let input: any;
    const form = new FormData();
    form.set("name", "New Status");
    form.set("kind", "open");
    form.set("color", "#456def");
    const response = await worker.fetch(new Request("https://tasks.example.com/settings/statuses", { method: "POST", headers: { accept: "application/json" }, body: form }), env({}, {
      createStatus: async (value: unknown): Promise<Result<{ id: string }>> => {
        input = value;
        return { ok: true, value: { id: "status_1" } };
      },
    }));
    expect(response.status).toBe(200);
    expect(input.color).toBe("#456def");
  });
});
