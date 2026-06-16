import type { Status, Task, TaskNode } from "../types";
import { isTerminalStatus } from "./status";

export function buildTaskTree(tasks: Task[], statuses: Status[], parentId: string | null = null): TaskNode[] {
  const children = tasks
    .filter((task) => task.parentId === parentId && !task.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return children.map((task) => {
    const nested = buildTaskTree(tasks, statuses, task.id);
    return {
      ...task,
      status: statuses.find((status) => status.id === task.statusId) ?? null,
      childCount: tasks.filter((candidate) => candidate.parentId === task.id && !candidate.archivedAt).length,
      children: nested,
    };
  });
}

export function descendantIds(tasks: Task[], taskId: string): Set<string> {
  const ids = new Set<string>();
  const visit = (id: string) => {
    for (const child of tasks.filter((task) => task.parentId === id && !task.archivedAt)) {
      ids.add(child.id);
      visit(child.id);
    }
  };
  visit(taskId);
  return ids;
}

export function findDeepestIncompleteDescendant(tasks: Task[], statuses: Status[], taskId: string): Task | null {
  const queue = tasks.filter((task) => task.parentId === taskId && !task.archivedAt).map((task) => ({ task, depth: 1 }));
  const incomplete: Array<{ task: Task; depth: number }> = [];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) continue;
    if (!isTerminalStatus(statuses, current.task.statusId)) incomplete.push(current);
    for (const child of tasks.filter((task) => task.parentId === current.task.id && !task.archivedAt)) {
      queue.push({ task: child, depth: current.depth + 1 });
    }
  }
  incomplete.sort((a, b) => b.depth - a.depth || a.task.sortOrder - b.task.sortOrder || a.task.createdAt.localeCompare(b.task.createdAt));
  return incomplete[0]?.task ?? null;
}

export function taskPath(tasks: Task[], taskId: string): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const path: Task[] = [];
  let current = byId.get(taskId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
