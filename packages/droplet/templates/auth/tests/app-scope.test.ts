import { describe, expect, it } from "vitest";
import { canPasskeyAccessApp } from "../src/routes/login";

describe("passkey app scope", () => {
  it("allows admin passkeys to access any app", () => {
    expect(canPasskeyAccessApp({ isAdmin: true, appId: null }, "photos")).toBe(true);
    expect(canPasskeyAccessApp({ isAdmin: true, appId: "tracker" }, "photos")).toBe(true);
  });

  it("allows non-admin passkeys only for their assigned app", () => {
    expect(canPasskeyAccessApp({ isAdmin: false, appId: "photos" }, "photos")).toBe(true);
    expect(canPasskeyAccessApp({ isAdmin: false, appId: "photos" }, "tracker")).toBe(false);
  });

  it("rejects non-admin passkeys without app access", () => {
    expect(canPasskeyAccessApp({ isAdmin: false, appId: null }, "photos")).toBe(false);
  });
});
