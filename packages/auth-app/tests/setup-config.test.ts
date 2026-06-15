import { describe, expect, it } from "vitest";
import { deriveAuthOrigin, requireSetupEnv, SetupConfigError } from "../src/setup-config";

describe("setup config", () => {
  it("derives auth origin from worker name and root", () => {
    expect(deriveAuthOrigin("family-auth", "myteam.workers.dev")).toBe("https://family-auth.myteam.workers.dev");
  });

  it("rejects URL-like worker roots", () => {
    expect(() => deriveAuthOrigin("family-auth", "https://myteam.workers.dev")).toThrow(SetupConfigError);
  });

  it("rejects unsafe worker names", () => {
    expect(() => deriveAuthOrigin("Family_Auth", "myteam.workers.dev")).toThrow(SetupConfigError);
  });

  it("validates full setup env", () => {
    expect(
      requireSetupEnv({
        AUTH_WORKER_NAME: "family-auth",
        WORKER_ROOT: "myteam.workers.dev",
        ALLOWED_APPS: '{"photos":"https://photos.example.com"}',
      }),
    ).toEqual({
      authWorkerName: "family-auth",
      workerRoot: "myteam.workers.dev",
      authOrigin: "https://family-auth.myteam.workers.dev",
      allowedAppsJson: '{"photos":"https://photos.example.com"}',
    });
  });
});
