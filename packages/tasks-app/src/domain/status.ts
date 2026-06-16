import type { Status, StatusKind } from "../types";

export const DEFAULT_STATUSES: Status[] = [
  { id: "backlog", name: "Backlog", kind: "open", sortOrder: 10, color: "#64748b", isDefault: true },
  { id: "ready", name: "Ready", kind: "open", sortOrder: 20, color: "#2563eb", isDefault: false },
  { id: "in_progress", name: "In Progress", kind: "active", sortOrder: 30, color: "#16a34a", isDefault: false },
  { id: "blocked", name: "Blocked", kind: "blocked", sortOrder: 40, color: "#d97706", isDefault: false },
  { id: "done", name: "Done", kind: "terminal", sortOrder: 50, color: "#7c3aed", isDefault: false },
  { id: "canceled", name: "Canceled", kind: "terminal", sortOrder: 60, color: "#6b7280", isDefault: false },
];

export const DEFAULT_STATUS_COLOR = "#2563eb";

export function isStatusKind(value: string): value is StatusKind {
  return value === "open" || value === "active" || value === "blocked" || value === "terminal";
}

export function isTerminalStatus(statuses: Status[], statusId: string): boolean {
  return statuses.some((status) => status.id === statusId && status.kind === "terminal");
}

export function normalizeStatusColor(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function isValidStatusColor(value: unknown): boolean {
  return value == null || value === "" || normalizeStatusColor(value) !== null;
}

export function defaultStatus(statuses: Status[]): Status {
  const status = statuses.find((item) => item.isDefault) ?? statuses[0];
  if (!status) throw new Error("No statuses configured");
  return status;
}

export function nextGeneratedStatusId(existingIds: Iterable<string>): string {
  const existing = new Set(existingIds);
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `status_${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `status_${crypto.randomUUID().replaceAll("-", "")}`;
}
