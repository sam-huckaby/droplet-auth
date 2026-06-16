import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown || "", { async: false, gfm: true, breaks: true });
  return sanitizeHtml(raw, {
    allowedTags: ["p", "br", "strong", "em", "code", "pre", "blockquote", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "hr"],
    allowedAttributes: { a: ["href", "title", "rel", "target"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noreferrer", target: "_blank" }),
    },
  });
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
