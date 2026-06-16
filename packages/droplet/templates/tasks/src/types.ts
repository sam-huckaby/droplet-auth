import type { ProjectState } from "./project-state";

export interface Env {
  PROJECT_NAME?: string;
  AUTH_ORIGIN?: string;
  APP_ID?: string;
  AUTH_SERVICE?: Fetcher;
  PROJECT_STATE: DurableObjectNamespace<ProjectState>;
}

export type StatusKind = "open" | "active" | "blocked" | "terminal";

export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  descriptionMarkdown: string;
  statusId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface TaskNote {
  id: string;
  taskId: string;
  bodyMarkdown: string;
  createdAt: string;
  createdBy: string | null;
}

export interface Status {
  id: string;
  name: string;
  kind: StatusKind;
  sortOrder: number;
  color: string | null;
  isDefault: boolean;
}

export interface TaskNode extends Task {
  status: Status | null;
  childCount: number;
  children: TaskNode[];
}

export interface BlockingTask {
  id: string;
  title: string;
  url: string;
}

export interface AppError {
  code: string;
  message: string;
  details?: unknown;
  blockingTask?: BlockingTask;
}

export interface Result<T> {
  ok: boolean;
  value?: T;
  error?: AppError;
}
