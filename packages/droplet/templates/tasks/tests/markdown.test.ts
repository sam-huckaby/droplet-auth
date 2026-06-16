import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/html/markdown";

describe("renderMarkdown", () => {
  it("renders common markdown", () => {
    const html = renderMarkdown("# Title\n\n- one\n- two");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<li>one</li>");
  });

  it("sanitizes unsafe HTML", () => {
    const html = renderMarkdown("<script>alert(1)</script>\n\n[bad](javascript:alert(1))");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
  });
});
