import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("favicon assets", () => {
  it("serves favicon.ico", async () => {
    const response = await worker.fetch(new Request("https://chat.example.com/favicon.ico"), {} as any);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/x-icon");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("serves PNG icons", async () => {
    const response = await worker.fetch(new Request("https://chat.example.com/favicon-32x32.png"), {} as any);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("serves Droplet Chat web manifest", async () => {
    const response = await worker.fetch(new Request("https://chat.example.com/site.webmanifest"), {} as any);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/manifest+json");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    await expect(response.json()).resolves.toMatchObject({ name: "Droplet Chat", short_name: "Droplet Chat" });
  });
});
