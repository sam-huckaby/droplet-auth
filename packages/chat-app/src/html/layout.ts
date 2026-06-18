export function htmlPage(title: string, body: string): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="shortcut icon" href="/favicon.ico">
  <style>
    :root { color-scheme: light dark; --bg: #f4f7fb; --surface: #fff; --soft: #eef4fb; --border: #d7e2ef; --text: #132033; --muted: #64748b; --accent: #166fbf; --sent-bg: #dbeeff; --sent-border: #a8d2ff; --received-bg: #dcf7dd; --received-border: #a8dfa9; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    @media (prefers-color-scheme: dark) { :root { --bg: #07111f; --surface: #0f1b2d; --soft: #17253a; --border: #28405f; --text: #e6eef8; --muted: #94a6bd; --accent: #67b7ff; --sent-bg: #12395f; --sent-border: #2d6ea8; --received-bg: #183f24; --received-border: #327a44; } }
    * { box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body { margin: 0; background: radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 18%, transparent), transparent 28rem), var(--bg); color: var(--text); }
    main { width: min(100%, 1120px); height: 100vh; min-height: 0; margin: 0 auto; padding: 0.75rem; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 0.65rem; }
    header, .composer, .thread-panel { border: 1px solid var(--border); border-radius: 20px; background: color-mix(in srgb, var(--surface) 92%, transparent); box-shadow: 0 16px 40px rgb(15 23 42 / 0.08); }
    header { padding: 0.75rem 1rem; display: flex; justify-content: space-between; gap: 1rem; align-items: center; flex-shrink: 0; }
    h1, p { margin: 0; }
    h1 { font-size: clamp(1.35rem, 3.5vw, 2rem); letter-spacing: -0.045em; }
    p { color: var(--muted); line-height: 1.38; }
    button, input, textarea { font: inherit; }
    button { border: 1px solid var(--border); border-radius: 12px; padding: 0.65rem 0.9rem; color: white; background: var(--accent); cursor: pointer; }
    button.secondary { color: var(--text); background: var(--surface); }
    input, textarea { width: 100%; border: 1px solid var(--border); border-radius: 14px; padding: 0.65rem 0.75rem; background: var(--surface); color: var(--text); }
    textarea { min-height: 3.4rem; resize: vertical; }
    a { color: var(--accent); }
    .chat-shell { position: relative; display: block; min-height: 0; overflow: hidden; }
    .messages, .thread-panel { min-height: 0; overflow: auto; }
    .messages { height: 100%; display: flex; flex-direction: column; gap: 0.45rem; padding-bottom: 0.25rem; overflow-y: auto; }
    .message, .reply { width: fit-content; max-width: min(78%, 44rem); border: 1px solid var(--border); border-radius: 16px; background: var(--surface); padding: 0.65rem 0.75rem; }
    .message-human, .reply-human { align-self: flex-end; border-color: var(--sent-border); border-bottom-right-radius: 5px; background: var(--sent-bg); }
    .message-remote, .reply-remote { align-self: flex-start; border-color: var(--received-border); border-bottom-left-radius: 5px; background: var(--received-bg); }
    .message-human .meta, .reply-human .meta { justify-content: flex-end; }
    .meta { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin-bottom: 0.3rem; color: var(--muted); font-size: 0.8rem; }
    .badge { border: 1px solid var(--border); border-radius: 999px; padding: 0.08rem 0.45rem; font-size: 0.75rem; }
    .badge-agent { color: var(--agent); }
    .body { white-space: pre-wrap; line-height: 1.36; }
    .composer { padding: 0.65rem; display: grid; gap: 0.5rem; flex-shrink: 0; box-shadow: 0 -10px 28px rgb(15 23 42 / 0.06); }
    .composer-row { display: grid; grid-template-columns: 12rem 1fr auto; gap: 0.5rem; align-items: end; }
    .thread-panel { position: absolute; top: 0; right: 0; bottom: 0; width: min(25rem, 92vw); padding: 0.65rem; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 0.55rem; overflow: hidden; opacity: 0; pointer-events: none; transform: translateX(calc(100% + 0.75rem)); transition: transform 180ms ease, opacity 180ms ease; box-shadow: -18px 0 42px rgb(15 23 42 / 0.18); z-index: 2; }
    .thread-panel.thread-open { opacity: 1; pointer-events: auto; transform: translateX(0); }
    .thread-list { display: flex; flex-direction: column; gap: 0.45rem; overflow: auto; min-height: 0; }
    .hidden { display: none; }
    .status { color: var(--muted); font-size: 0.84rem; }
    #connection-status { border: 1px solid var(--border); border-radius: 999px; padding: 0.25rem 0.55rem; background: var(--soft); color: var(--text); white-space: nowrap; }
    @media (max-width: 820px) { main { padding: 0.5rem; gap: 0.5rem; } header { align-items: flex-start; flex-direction: column; padding: 0.65rem 0.75rem; } .thread-panel { width: min(100%, 28rem); } .composer-row { grid-template-columns: 1fr; } }
  </style>
</head>
<body><main>${body}</main></body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
