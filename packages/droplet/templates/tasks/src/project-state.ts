import { DurableObject } from "cloudflare:workers";
import { DEFAULT_STATUSES, defaultStatus, isStatusKind, isTerminalStatus, isValidStatusColor, nextGeneratedStatusId, normalizeStatusColor } from "./domain/status";
import { buildTaskTree, descendantIds, findDeepestIncompleteDescendant, taskPath } from "./domain/tree";
import { fail, ok, validateMarkdown, validateRequiredMarkdown, validateTitle } from "./domain/validation";
import type { Env, Result, Status, StatusKind, Task, TaskNote } from "./types";

type TaskRow = {
  id: string;
  parent_id: string | null;
  title: string;
  description_markdown: string;
  status_id: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type StatusRow = {
  id: string;
  name: string;
  kind: string;
  sort_order: number;
  color: string | null;
  is_default: number;
};

type NoteRow = {
  id: string;
  task_id: string;
  body_markdown: string;
  created_at: string;
  created_by: string | null;
};

type CountRow = { count: number };

export class ProjectState extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.initializeSchema();
      this.seedStatuses();
    });
  }

  async health(): Promise<{ ok: true }> {
    return { ok: true };
  }

  async projectSummary(projectName: string, authEnabled: boolean) {
    const statuses = this.listStatusesSync();
    const tasks = this.listTasksSync();
    const terminal = tasks.filter((task) => isTerminalStatus(statuses, task.statusId)).length;
    return {
      project: { name: projectName, authEnabled },
      statuses,
      counts: { totalTasks: tasks.length, terminalTasks: terminal, nonTerminalTasks: tasks.length - terminal },
    };
  }

  async listRootTasks() {
    const tasks = this.listTasksSync();
    const statuses = this.listStatusesSync();
    return buildTaskTree(tasks, statuses, null);
  }

  async fullTree() {
    return { rootTasks: await this.listRootTasks() };
  }

  async listTasksByStatus(statusId?: string) {
    const tasks = this.listTasksSync().filter((task) => !statusId || task.statusId === statusId);
    const statuses = this.listStatusesSync();
    return tasks.map((task) => ({
      ...task,
      status: statuses.find((status) => status.id === task.statusId) ?? null,
      childCount: tasks.filter((candidate) => candidate.parentId === task.id && !candidate.archivedAt).length,
    }));
  }

  async getTaskDetail(id: string): Promise<Result<unknown>> {
    const tasks = this.listTasksSync();
    const task = tasks.find((item) => item.id === id && !item.archivedAt);
    if (!task) return fail("NOT_FOUND", "Task not found.");
    const statuses = this.listStatusesSync();
    const children = buildTaskTree(tasks, statuses, id);
    const notes = this.listNotesSync(id);
    return ok({
      task,
      status: statuses.find((status) => status.id === task.statusId) ?? null,
      path: taskPath(tasks, id).map((item) => ({ id: item.id, title: item.title })),
      children,
      notes,
      statuses,
    });
  }

  async createTask(input: { parentId?: string | null; title: unknown; descriptionMarkdown?: unknown; statusId?: string | null; actor?: string | null }): Promise<Result<Task>> {
    const title = validateTitle(input.title);
    if (!title.ok) return fail("VALIDATION_ERROR", title.error?.message ?? "Title is invalid.");
    const description = validateMarkdown(input.descriptionMarkdown, "Description", 100_000);
    if (!description.ok) return fail("VALIDATION_ERROR", description.error?.message ?? "Description is invalid.");
    const statuses = this.listStatusesSync();
    const statusId = input.statusId || defaultStatus(statuses).id;
    if (!statuses.some((status) => status.id === statusId)) return fail("INVALID_STATUS", "Status does not exist.");
    const parentId = input.parentId?.trim() || null;
    if (parentId && !this.getTaskSync(parentId)) return fail("NOT_FOUND", "Parent task not found.");
    const now = new Date().toISOString();
    const id = makeId("task");
    const sortOrder = this.nextSortOrder(parentId);
    this.ctx.storage.sql.exec(
      "INSERT INTO tasks (id, parent_id, title, description_markdown, status_id, sort_order, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)",
      id,
      parentId,
      title.value!,
      description.value!,
      statusId,
      sortOrder,
      now,
      now,
    );
    this.recordEvent("task_created", id, input.actor ?? null, { parentId, statusId });
    return ok(this.getTaskSync(id)!);
  }

  async updateTask(id: string, input: { title?: unknown; descriptionMarkdown?: unknown; statusId?: string; parentId?: string | null; actor?: string | null }): Promise<Result<Task>> {
    const existing = this.getTaskSync(id);
    if (!existing) return fail("NOT_FOUND", "Task not found.");
    const tasks = this.listTasksSync();
    const statuses = this.listStatusesSync();
    const updates = {
      title: existing.title,
      descriptionMarkdown: existing.descriptionMarkdown,
      statusId: existing.statusId,
      parentId: existing.parentId,
    };
    if (input.title !== undefined) {
      const result = validateTitle(input.title);
      if (!result.ok) return fail("VALIDATION_ERROR", result.error?.message ?? "Title is invalid.");
      updates.title = result.value!;
    }
    if (input.descriptionMarkdown !== undefined) {
      const result = validateMarkdown(input.descriptionMarkdown, "Description", 100_000);
      if (!result.ok) return fail("VALIDATION_ERROR", result.error?.message ?? "Description is invalid.");
      updates.descriptionMarkdown = result.value!;
    }
    if (input.statusId !== undefined) {
      if (!statuses.some((status) => status.id === input.statusId)) return fail("INVALID_STATUS", "Status does not exist.");
      if (isTerminalStatus(statuses, input.statusId)) {
        const blocker = findDeepestIncompleteDescendant(tasks, statuses, id);
        if (blocker) {
          return {
            ok: false,
            error: {
              code: "TERMINAL_STATE_BLOCKED",
              message: "Task cannot enter a terminal state until all descendants are terminal.",
              blockingTask: { id: blocker.id, title: blocker.title, url: `/tasks/${blocker.id}` },
            },
          };
        }
      }
      updates.statusId = input.statusId;
    }
    if (input.parentId !== undefined) {
      const parentId = input.parentId?.trim() || null;
      if (parentId === id) return fail("CYCLE_DETECTED", "A task cannot be its own parent.");
      if (parentId && !this.getTaskSync(parentId)) return fail("NOT_FOUND", "Parent task not found.");
      if (parentId && descendantIds(tasks, id).has(parentId)) return fail("CYCLE_DETECTED", "A task cannot be moved under one of its descendants.");
      updates.parentId = parentId;
    }
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      "UPDATE tasks SET parent_id = ?, title = ?, description_markdown = ?, status_id = ?, updated_at = ? WHERE id = ?",
      updates.parentId,
      updates.title,
      updates.descriptionMarkdown,
      updates.statusId,
      now,
      id,
    );
    this.recordEvent(existing.statusId === updates.statusId ? "task_updated" : "task_status_changed", id, input.actor ?? null, updates);
    return ok(this.getTaskSync(id)!);
  }

  async appendNote(taskId: string, input: { bodyMarkdown: unknown; actor?: string | null }): Promise<Result<TaskNote>> {
    if (!this.getTaskSync(taskId)) return fail("NOT_FOUND", "Task not found.");
    const body = validateRequiredMarkdown(input.bodyMarkdown, "Note", 50_000);
    if (!body.ok) return fail("VALIDATION_ERROR", body.error?.message ?? "Note is invalid.");
    const id = makeId("note");
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO task_notes (id, task_id, body_markdown, created_at, created_by) VALUES (?, ?, ?, ?, ?)",
      id,
      taskId,
      body.value!,
      now,
      input.actor ?? null,
    );
    this.ctx.storage.sql.exec("UPDATE tasks SET updated_at = ? WHERE id = ?", now, taskId);
    this.recordEvent("task_note_added", taskId, input.actor ?? null, { noteId: id });
    return ok(this.listNotesSync(taskId).find((note) => note.id === id)!);
  }

  async listStatuses(): Promise<Status[]> {
    return this.listStatusesSync();
  }

  async createStatus(input: { id?: string; name: unknown; kind: unknown; color?: unknown; isDefault?: boolean }): Promise<Result<Status>> {
    const name = validateTitle(input.name);
    if (!name.ok) return fail("VALIDATION_ERROR", name.error?.message ?? "Status name is invalid.");
    const kind = typeof input.kind === "string" && isStatusKind(input.kind) ? input.kind : null;
    if (!kind) return fail("VALIDATION_ERROR", "Status kind is invalid.");
    if (!isValidStatusColor(input.color)) return fail("VALIDATION_ERROR", "Status color must be a hex color like #2563eb.");
    const id = input.id?.trim() ? input.id.trim().slice(0, 80) : this.nextStatusId();
    if (this.listStatusesSync().some((status) => status.id === id)) return fail("VALIDATION_ERROR", "Status ID already exists.");
    const now = new Date().toISOString();
    const sortOrder = this.nextStatusSortOrder();
    if (input.isDefault) this.ctx.storage.sql.exec("UPDATE statuses SET is_default = 0");
    this.ctx.storage.sql.exec(
      "INSERT INTO statuses (id, name, kind, sort_order, color, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      name.value!,
      kind,
      sortOrder,
      normalizeStatusColor(input.color),
      input.isDefault ? 1 : 0,
      now,
      now,
    );
    this.recordEvent("status_created", null, null, { id });
    return ok(this.listStatusesSync().find((status) => status.id === id)!);
  }

  async updateStatus(id: string, input: { name?: unknown; kind?: unknown; color?: unknown; isDefault?: boolean }): Promise<Result<Status>> {
    const existing = this.listStatusesSync().find((status) => status.id === id);
    if (!existing) return fail("NOT_FOUND", "Status not found.");
    let name = existing.name;
    let kind: StatusKind = existing.kind;
    if (input.name !== undefined) {
      const result = validateTitle(input.name);
      if (!result.ok) return fail("VALIDATION_ERROR", result.error?.message ?? "Status name is invalid.");
      name = result.value!;
    }
    if (input.kind !== undefined) {
      if (typeof input.kind !== "string" || !isStatusKind(input.kind)) return fail("VALIDATION_ERROR", "Status kind is invalid.");
      kind = input.kind;
    }
    if (!isValidStatusColor(input.color)) return fail("VALIDATION_ERROR", "Status color must be a hex color like #2563eb.");
    if (existing.kind === "terminal" && kind !== "terminal" && this.listStatusesSync().filter((status) => status.kind === "terminal" && status.id !== id).length === 0) {
      return fail("TERMINAL_STATUS_REQUIRED", "At least one terminal status is required.");
    }
    if (input.isDefault) this.ctx.storage.sql.exec("UPDATE statuses SET is_default = 0");
    this.ctx.storage.sql.exec("UPDATE statuses SET name = ?, kind = ?, color = ?, is_default = ?, updated_at = ? WHERE id = ?", name, kind, input.color === undefined ? existing.color : normalizeStatusColor(input.color), input.isDefault ? 1 : existing.isDefault ? 1 : 0, new Date().toISOString(), id);
    this.recordEvent("status_updated", null, null, { id });
    return ok(this.listStatusesSync().find((status) => status.id === id)!);
  }

  async deleteStatus(id: string): Promise<Result<{ deleted: true }>> {
    const statuses = this.listStatusesSync();
    const existing = statuses.find((status) => status.id === id);
    if (!existing) return fail("NOT_FOUND", "Status not found.");
    if (statuses.length === 1) return fail("DEFAULT_STATUS_REQUIRED", "At least one status is required.");
    if (existing.kind === "terminal" && statuses.filter((status) => status.kind === "terminal" && status.id !== id).length === 0) return fail("TERMINAL_STATUS_REQUIRED", "At least one terminal status is required.");
    if (existing.isDefault) return fail("DEFAULT_STATUS_REQUIRED", "Default status cannot be deleted.");
    const count = this.ctx.storage.sql.exec<CountRow>("SELECT COUNT(*) as count FROM tasks WHERE status_id = ? AND archived_at IS NULL", id).one().count;
    if (count > 0) return fail("STATUS_IN_USE", "Status is used by tasks and cannot be deleted.");
    this.ctx.storage.sql.exec("DELETE FROM statuses WHERE id = ?", id);
    this.recordEvent("status_deleted", null, null, { id });
    return ok({ deleted: true });
  }

  private initializeSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        title TEXT NOT NULL,
        description_markdown TEXT NOT NULL DEFAULT '',
        status_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status_id ON tasks(status_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(parent_id, sort_order);
      CREATE TABLE IF NOT EXISTS task_notes (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_notes_created_at ON task_notes(task_id, created_at);
      CREATE TABLE IF NOT EXISTS statuses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        color TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        task_id TEXT,
        created_at TEXT NOT NULL,
        actor TEXT,
        metadata TEXT NOT NULL
      );
    `);
  }

  private seedStatuses(): void {
    const count = this.ctx.storage.sql.exec<CountRow>("SELECT COUNT(*) as count FROM statuses").one().count;
    if (count > 0) return;
    const now = new Date().toISOString();
    for (const status of DEFAULT_STATUSES) {
      this.ctx.storage.sql.exec("INSERT INTO statuses (id, name, kind, sort_order, color, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", status.id, status.name, status.kind, status.sortOrder, status.color, status.isDefault ? 1 : 0, now, now);
    }
  }

  private listTasksSync(): Task[] {
    return this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE archived_at IS NULL ORDER BY parent_id, sort_order, created_at").toArray().map(taskFromRow);
  }

  private getTaskSync(id: string): Task | null {
    return this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id = ? AND archived_at IS NULL", id).toArray().map(taskFromRow)[0] ?? null;
  }

  private listStatusesSync(): Status[] {
    return this.ctx.storage.sql.exec<StatusRow>("SELECT id, name, kind, sort_order, color, is_default FROM statuses ORDER BY sort_order, name").toArray().map(statusFromRow);
  }

  private listNotesSync(taskId: string): TaskNote[] {
    return this.ctx.storage.sql.exec<NoteRow>("SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at ASC", taskId).toArray().map(noteFromRow);
  }

  private nextSortOrder(parentId: string | null): number {
    const rows = this.ctx.storage.sql.exec<{ max_sort: number | null }>("SELECT MAX(sort_order) as max_sort FROM tasks WHERE parent_id IS ?", parentId).toArray();
    return (rows[0]?.max_sort ?? 0) + 10;
  }

  private nextStatusSortOrder(): number {
    const rows = this.ctx.storage.sql.exec<{ max_sort: number | null }>("SELECT MAX(sort_order) as max_sort FROM statuses").toArray();
    return (rows[0]?.max_sort ?? 0) + 10;
  }

  private nextStatusId(): string {
    return nextGeneratedStatusId(this.listStatusesSync().map((status) => status.id)).slice(0, 80);
  }

  private recordEvent(eventType: string, taskId: string | null, actor: string | null, metadata: unknown): void {
    this.ctx.storage.sql.exec("INSERT INTO activity_events (id, event_type, task_id, created_at, actor, metadata) VALUES (?, ?, ?, ?, ?, ?)", makeId("event"), eventType, taskId, new Date().toISOString(), actor, JSON.stringify(metadata ?? {}));
  }
}

function taskFromRow(row: TaskRow): Task {
  return { id: row.id, parentId: row.parent_id, title: row.title, descriptionMarkdown: row.description_markdown, statusId: row.status_id, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at };
}

function statusFromRow(row: StatusRow): Status {
  return { id: row.id, name: row.name, kind: row.kind as StatusKind, sortOrder: row.sort_order, color: row.color, isDefault: row.is_default === 1 };
}

function noteFromRow(row: NoteRow): TaskNote {
  return { id: row.id, taskId: row.task_id, bodyMarkdown: row.body_markdown, createdAt: row.created_at, createdBy: row.created_by };
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
