import { describe, expect, it } from "vitest";
import { findDeepestIncompleteDescendant } from "../src/domain/tree";
import type { Status, Task } from "../src/types";

const statuses: Status[] = [
  { id: "ready", name: "Ready", kind: "open", sortOrder: 10, color: null, isDefault: true },
  { id: "done", name: "Done", kind: "terminal", sortOrder: 20, color: null, isDefault: false },
];

function task(id: string, parentId: string | null, statusId: string, sortOrder = 10): Task {
  return { id, parentId, title: id, descriptionMarkdown: "", statusId, sortOrder, createdAt: `2026-01-01T00:00:0${sortOrder}.000Z`, updatedAt: "2026-01-01T00:00:00.000Z", archivedAt: null };
}

describe("terminal-state tree validation", () => {
  it("returns the deepest incomplete descendant", () => {
    const tasks = [task("root", null, "ready"), task("child-a", "root", "done"), task("child-b", "root", "ready", 20), task("grandchild", "child-b", "ready")];
    expect(findDeepestIncompleteDescendant(tasks, statuses, "root")?.id).toBe("grandchild");
  });

  it("returns null when every descendant is terminal", () => {
    const tasks = [task("root", null, "ready"), task("child-a", "root", "done"), task("child-b", "root", "done", 20)];
    expect(findDeepestIncompleteDescendant(tasks, statuses, "root")).toBeNull();
  });
});
