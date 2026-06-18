import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/env";
import { chatPage } from "../src/html/chat";

describe("chat page client script", () => {
  it("renders syntactically valid JavaScript", async () => {
    const response = chatPage(config(), { name: null });
    const html = await response.text();
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
  });

  it("renders favicon head links", async () => {
    const response = chatPage(config(), { name: null });
    const html = await response.text();
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain('href="/favicon-32x32.png"');
    expect(html).toContain('href="/favicon-16x16.png"');
    expect(html).toContain('href="/site.webmanifest"');
    expect(html).toContain('href="/favicon.ico"');
  });

  it("renders bubble alignment class logic", async () => {
    const response = chatPage(config(), { name: null });
    const html = await response.text();
    expect(html).toContain("message-human");
    expect(html).toContain("message-remote");
    expect(html).toContain("reply-human");
    expect(html).toContain("reply-remote");
  });

  it("renders slide-in thread panel behavior", async () => {
    const response = chatPage(config(), { name: null });
    const html = await response.text();
    expect(html).toContain('id="thread-panel" class="thread-panel" aria-hidden="true"');
    expect(html).toContain("thread-open");
    expect(html).toContain("aria-hidden', 'false'");
    expect(html).toContain("aria-hidden', 'true'");
  });

  it("renders Enter-to-send keyboard behavior", async () => {
    const response = chatPage(config(), { name: null });
    const html = await response.text();
    expect(html).toContain("submitOnEnter");
    expect(html).toContain("requestSubmit");
    expect(html).toContain("shiftKey");
    expect(html).toContain("isComposing");
  });

  it("renders near-bottom auto-scroll behavior", async () => {
    const response = chatPage(config(), { name: null });
    const html = await response.text();
    expect(html).toContain("isNearBottom");
    expect(html).toContain("scrollToBottom");
    expect(html).toContain("forceScroll");
    expect(html).toContain("clientHeight < 50");
  });
});

function config(): AppConfig {
  return {
    roomName: "droplet-chat",
    publicOrigin: "https://chat.example.com",
    roomDescription: "Test room",
    maxUploadBytes: 1073741824,
    fileTtlSeconds: 604800,
    agentApiKey: "droplet_agent_test",
    auth: { enabled: false },
  };
}
