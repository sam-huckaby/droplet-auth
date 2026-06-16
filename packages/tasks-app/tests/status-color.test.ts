import { describe, expect, it } from "vitest";
import { normalizeStatusColor, isValidStatusColor, nextGeneratedStatusId } from "../src/domain/status";

describe("status colors", () => {
  it("normalizes valid hex colors", () => {
    expect(normalizeStatusColor("#ABC123")).toBe("#abc123");
  });

  it("rejects invalid colors", () => {
    expect(isValidStatusColor("red")).toBe(false);
    expect(isValidStatusColor("#12345")).toBe(false);
    expect(isValidStatusColor("#123456; color: red")).toBe(false);
  });
});

describe("generated status IDs", () => {
  it("uses neutral status IDs instead of deriving from New Status", () => {
    expect(nextGeneratedStatusId(["backlog", "ready", "done"])).toBe("status_1");
  });

  it("uses the first available status index", () => {
    expect(nextGeneratedStatusId(["status_1", "status_3"])).toBe("status_2");
  });
});
