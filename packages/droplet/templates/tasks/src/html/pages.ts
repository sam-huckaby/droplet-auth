import type { Status, TaskNode, TaskNote } from "../types";
import { DEFAULT_STATUS_COLOR, normalizeStatusColor } from "../domain/status";
import { escapeHtml, renderMarkdown } from "./markdown";
import { header } from "./layout";

export function homePage(projectName: string, authEnabled: boolean, tasks: TaskNode[]): string {
  return `${header(projectName, { authEnabled })}<section class="hero"><h1>${escapeHtml(projectName)}</h1><p class="muted">A focused task tree for this project.</p></section>${taskTable(tasks)}<p><a class="button" href="/tasks/new">Create root task</a></p>`;
}

export function newTaskPage(projectName: string, authEnabled: boolean, statuses: Status[], parentId?: string): string {
  return `${header(projectName, { authEnabled })}<section class="hero"><h1>${parentId ? "Create child task" : "Create root task"}</h1></section><section class="panel">${taskForm("/tasks", statuses, { parentId })}</section>`;
}

export function taskPage(projectName: string, authEnabled: boolean, detail: any, error?: string): string {
  const task = detail.task;
  const statuses = detail.statuses as Status[];
  const path = detail.path.map((item: { id: string; title: string }) => `<a href="/tasks/${item.id}">${escapeHtml(item.title)}</a>`).join(" / ");
  return `${header(projectName, { authEnabled })}${error ? `<div class="error">${error}</div>` : ""}<nav class="breadcrumb">${path}</nav><form method="post" action="/tasks/${task.id}/status" class="toolbar status-form" data-initial-status="${escapeHtml(task.statusId)}"><label>Status <select class="status-select" name="statusId">${statusOptions(statuses, task.statusId)}</select></label><button class="status-save">Update status</button></form><section class="hero"><h1>${escapeHtml(task.title)}</h1></section><section class="panel markdown">${renderMarkdown(task.descriptionMarkdown || "No description yet.")}</section><details class="panel"><summary>Edit task</summary>${taskForm(`/tasks/${task.id}`, statuses, task)}</details><h2>Work Log</h2>${notesList(detail.notes)}<section class="panel"><form method="post" action="/tasks/${task.id}/notes" class="stack"><textarea name="bodyMarkdown" required placeholder="Append a work-log note"></textarea><button>Add note</button></form></section><h2>Child Tasks</h2>${taskTable(detail.children)}<details class="panel"><summary>Add child task</summary>${taskForm(`/tasks/${task.id}/children`, statuses, { parentId: task.id })}</details>`;
}

export function settingsPage(projectName: string, authEnabled: boolean, appId: string | undefined, statuses: Status[], error?: string): string {
  const rows = statuses.map((status) => {
    const deleteAction = status.isDefault ? "" : `<form method="post" action="/settings/statuses/${status.id}/delete"><button class="danger">Delete</button></form>`;
    return `<tr class="settings-status-row" data-status-id="${escapeHtml(status.id)}" data-update-url="/settings/statuses/${status.id}"><td data-label="Color"><input class="settings-status-control status-color-input" type="color" name="color" value="${statusColor(status)}" aria-label="Status color"></td><td data-label="Name"><input class="settings-status-control" type="text" name="name" value="${escapeHtml(status.name)}" aria-label="Status name"></td><td data-label="Kind"><select class="settings-status-control" name="kind" aria-label="Status kind">${kindOptions(status.kind)}</select></td><td data-label="Default"><label class="checkbox-label"><input class="settings-status-control" type="checkbox" name="isDefault" value="true" ${status.isDefault ? "checked disabled data-default-locked=\"true\"" : ""}> Default</label><span class="settings-feedback" aria-live="polite"></span></td><td data-label="Actions" class="settings-actions">${deleteAction}</td></tr>`;
  }).join("");
  return `${header(projectName, { authEnabled })}${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}<section class="hero"><h1>Settings</h1><p class="muted">Auth: <strong>${authEnabled ? "enabled" : "disabled"}</strong>${appId ? ` (${escapeHtml(appId)})` : ""}</p></section><div class="toolbar"><h2>Statuses</h2><form method="post" action="/settings/statuses"><input type="hidden" name="name" value="New Status"><input type="hidden" name="kind" value="open"><input type="hidden" name="color" value="${DEFAULT_STATUS_COLOR}"><button>Add status</button></form></div><section class="panel table-panel"><table><thead><tr><th>Color</th><th>Name</th><th>Kind</th><th>Default</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function taskTable(tasks: TaskNode[]): string {
  if (tasks.length === 0) return `<div class="empty">No tasks yet.</div>`;
  const rows = tasks.map((task) => `<tr><td data-label="Status">${statusBadge(task.status)}</td><td data-label="Title"><a href="/tasks/${task.id}">${escapeHtml(task.title)}</a></td><td data-label="Children">${task.childCount}</td><td data-label="Updated">${new Date(task.updatedAt).toLocaleString()}</td></tr>`).join("");
  return `<section class="panel table-panel"><table><thead><tr><th>Status</th><th>Title</th><th>Children</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function taskForm(action: string, statuses: Status[], task: { id?: string; parentId?: string | null; title?: string; descriptionMarkdown?: string; statusId?: string } = {}): string {
  return `<form method="post" action="${action}" class="stack"><input type="hidden" name="parentId" value="${escapeHtml(task.parentId ?? "")}"><label>Title <input type="text" name="title" value="${escapeHtml(task.title ?? "")}" required></label><label>Status <select name="statusId">${statusOptions(statuses, task.statusId)}</select></label><label>Description <textarea name="descriptionMarkdown">${escapeHtml(task.descriptionMarkdown ?? "")}</textarea></label><button>Save</button></form>`;
}

function notesList(notes: TaskNote[]): string {
  if (notes.length === 0) return `<div class="empty">No notes yet.</div>`;
  return notes.map((note) => `<article class="note"><p class="meta">${new Date(note.createdAt).toLocaleString()}${note.createdBy ? ` by ${escapeHtml(note.createdBy)}` : ""}</p>${renderMarkdown(note.bodyMarkdown)}</article>`).join("");
}

function statusBadge(status: Status | null): string {
  const label = status?.name ?? "Unknown";
  const color = statusColor(status);
  return `<span class="status" style="--status-color: ${color}">${escapeHtml(label)}</span>`;
}

function statusColor(status: Pick<Status, "color"> | null | undefined): string {
  return normalizeStatusColor(status?.color) ?? DEFAULT_STATUS_COLOR;
}

function statusOptions(statuses: Status[], selected?: string): string {
  return statuses.map((status) => `<option value="${status.id}" ${status.id === selected || (!selected && status.isDefault) ? "selected" : ""}>${escapeHtml(status.name)}</option>`).join("");
}

function kindOptions(selected: string): string {
  return ["open", "active", "blocked", "terminal"].map((kind) => `<option value="${kind}" ${kind === selected ? "selected" : ""}>${kind}</option>`).join("");
}
