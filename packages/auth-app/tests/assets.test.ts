import { describe, expect, it } from "vitest";
import { handleAsset } from "../src/routes/assets";

describe("favicon assets", () => {
  it("serves the ico favicon", async () => {
    const response = handleAsset("/favicon.ico");
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("image/x-icon");
    expect(response?.headers.get("cache-control")).toContain("max-age=31536000");
    expect((await response?.arrayBuffer())?.byteLength).toBeGreaterThan(0);
  });

  it("serves png icons", async () => {
    const response = handleAsset("/favicon-32x32.png");
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("image/png");
    expect((await response?.arrayBuffer())?.byteLength).toBeGreaterThan(0);
  });

  it("serves the web manifest", async () => {
    const response = handleAsset("/site.webmanifest");
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    await expect(response?.json()).resolves.toMatchObject({ name: "Droplet Auth", short_name: "Droplet Auth" });
  });

  it("returns null for unknown assets", () => {
    expect(handleAsset("/missing.png")).toBeNull();
  });
});
