import { escapeHtml } from "./markdown";

export function page(title: string, body: string): Response {
  return new Response(`<!doctype html>
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
  <meta name="theme-color" content="#f7f5ef" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#10100f" media="(prefers-color-scheme: dark)">
  <style>
    :root {
      color-scheme: light dark;
      --r: 4px;
      --s1: 4px;
      --s2: 6px;
      --s3: 10px;
      --s4: 16px;
      --s5: 26px;
      --s6: 42px;
      --s7: 68px;
      --bg: #f7f5ef;
      --bg-soft: #eeebe3;
      --surface: #fffdf8;
      --surface-2: #f4f0e8;
      --text: #191714;
      --muted: #6f685e;
      --border: #d8d0c3;
      --accent: #255f85;
      --accent-contrast: #ffffff;
      --danger: #a83232;
      --danger-soft: #f4dddd;
      --focus: #6ea7c8;
      --status-open-bg: #e7eef2;
      --status-open-text: #284e66;
      --status-active-bg: #e2eddf;
      --status-active-text: #315d33;
      --status-blocked-bg: #f1e2d8;
      --status-blocked-text: #84451d;
      --status-terminal-bg: #e7e2ee;
      --status-terminal-text: #55416f;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #10100f;
        --bg-soft: #171614;
        --surface: #1c1b18;
        --surface-2: #24221f;
        --text: #f0ece2;
        --muted: #aaa398;
        --border: #38342f;
        --accent: #8dc7eb;
        --accent-contrast: #0e1f2a;
        --danger: #ef8585;
        --danger-soft: #3b2020;
        --focus: #8dc7eb;
        --status-open-bg: #1b2d38;
        --status-open-text: #b7d8ea;
        --status-active-bg: #1e321f;
        --status-active-text: #b9dfb8;
        --status-blocked-bg: #3a291d;
        --status-blocked-text: #efc4a4;
        --status-terminal-bg: #2d2439;
        --status-terminal-text: #d8c6ef;
      }
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }
    main { max-width: 1080px; margin: 0 auto; padding: var(--s6) var(--s4) var(--s7); }
    header {
      display: flex;
      justify-content: space-between;
      gap: var(--s4);
      align-items: center;
      margin-bottom: var(--s6);
      padding-bottom: var(--s4);
      border-bottom: 1px solid var(--border);
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1, h2, h3 { margin: 0 0 var(--s4); line-height: 1.12; letter-spacing: -0.025em; }
    h1 { font-size: clamp(2rem, 6vw, 3.2rem); }
    h2 { margin-top: var(--s6); font-size: clamp(1.35rem, 4vw, 2rem); }
    p { margin: 0 0 var(--s4); }
    table { width: 100%; border-collapse: separate; border-spacing: 0; }
    th, td { padding: var(--s3); text-align: left; vertical-align: top; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    tbody tr:hover { background: color-mix(in srgb, var(--accent) 7%, transparent); }
    input, textarea, select, button { font: inherit; }
    input[type=text], textarea, select {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: var(--r);
      background: var(--surface);
      color: var(--text);
      padding: var(--s2) var(--s3);
    }
    input[type=color] {
      width: var(--s6);
      height: 38px;
      border: 1px solid var(--border);
      border-radius: var(--r);
      background: var(--surface);
      padding: var(--s1);
      cursor: pointer;
    }
    input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
    input[type=color]::-webkit-color-swatch { border: 0; border-radius: var(--r); }
    input[type=color]::-moz-color-swatch { border: 0; border-radius: var(--r); }
    textarea { min-height: 10rem; resize: vertical; }
    input:focus, textarea:focus, select:focus, button:focus-visible, summary:focus-visible, .button:focus-visible {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
    button, .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      border: 1px solid var(--accent);
      border-radius: var(--r);
      background: var(--accent);
      color: var(--accent-contrast);
      padding: var(--s2) var(--s4);
      font-weight: 650;
      text-decoration: none;
      cursor: pointer;
    }
    button:hover, .button:hover { text-decoration: none; filter: brightness(.96); }
    button:disabled { cursor: wait; opacity: .72; filter: none; }
    .secondary { border-color: var(--border); background: var(--surface); color: var(--text); }
    .danger { border-color: color-mix(in srgb, var(--danger) 55%, var(--border)); background: var(--danger-soft); color: var(--danger); }
    .brand { color: var(--text); font-weight: 800; letter-spacing: -0.03em; }
    .nav-link { font-weight: 650; }
    .nav-form { margin: 0; }
    .nav-button {
      min-height: 0;
      border: 0;
      background: transparent;
      color: var(--accent);
      padding: 0;
    }
    .nav-button:hover { text-decoration: underline; filter: none; }
    .muted, .meta { color: var(--muted); }
    .meta { font-size: .88rem; }
    .error {
      margin-bottom: var(--s5);
      border: 1px solid color-mix(in srgb, var(--danger) 60%, var(--border));
      border-radius: var(--r);
      background: var(--danger-soft);
      color: var(--danger);
      padding: var(--s3);
    }
    .stack { display: grid; gap: var(--s4); }
    .row { display: flex; gap: var(--s3); align-items: center; flex-wrap: wrap; }
    .hero { margin-bottom: var(--s5); }
    .hero p { max-width: 64ch; }
    .panel, details.panel {
      border: 1px solid var(--border);
      border-radius: var(--r);
      background: var(--surface);
      padding: var(--s3);
      margin-bottom: var(--s5);
      box-shadow: 0 1px 0 color-mix(in srgb, var(--text) 5%, transparent);
    }
    .table-panel { overflow: hidden; padding: 0; }
    .table-panel table { background: var(--surface); }
    .toolbar {
      display: flex;
      justify-content: space-between;
      gap: var(--s3);
      align-items: end;
      flex-wrap: wrap;
      margin-bottom: var(--s5);
    }
    .toolbar label { min-width: 220px; }
    .js .status-form .status-save { display: none; }
    .js .status-form.is-dirty .status-save { display: inline-flex; }
    .status-save.is-loading::after {
      content: "";
      width: var(--s3);
      height: var(--s3);
      margin-left: var(--s2);
      border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
      border-top-color: currentColor;
      border-radius: 999px;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .breadcrumb { margin-bottom: var(--s4); color: var(--muted); font-size: .92rem; }
    .empty {
      border: 1px dashed var(--border);
      border-radius: var(--r);
      background: color-mix(in srgb, var(--surface) 70%, transparent);
      color: var(--muted);
      padding: var(--s3);
      margin: 0 0 var(--s4);
    }
    .note {
      border: 1px solid var(--border);
      border-radius: var(--r);
      background: var(--surface-2);
      padding: var(--s3);
      margin: 0 0 var(--s4);
    }
    details.panel summary {
      cursor: pointer;
      color: var(--accent);
      font-weight: 750;
      list-style-position: inside;
    }
    details.panel form { margin-top: var(--s4); }
    .status {
      --status-color: var(--accent);
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      border: 1px solid color-mix(in srgb, var(--status-color) 55%, var(--border));
      border-radius: var(--r);
      background: color-mix(in srgb, var(--status-color) 14%, transparent);
      color: var(--status-color);
      padding: var(--s1) var(--s3);
      font-size: .82rem;
      font-weight: 750;
      white-space: nowrap;
    }
    .checkbox-label { display: inline-flex; gap: var(--s2); align-items: center; }
    .settings-actions form { margin: 0; }
    .settings-feedback {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      margin-left: var(--s3);
      color: var(--muted);
      font-size: .86rem;
    }
    .settings-feedback.is-saving::before {
      content: "";
      width: var(--s3);
      height: var(--s3);
      margin-right: var(--s2);
      border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
      border-top-color: currentColor;
      border-radius: 999px;
      animation: spin .8s linear infinite;
    }
    .settings-feedback.is-error { color: var(--danger); }
    .settings-feedback.is-saved { color: var(--muted); }
    .markdown > :last-child, .note > :last-child { margin-bottom: 0; }
    .markdown pre, .note pre {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: var(--r);
      background: var(--surface-2);
      padding: var(--s3);
    }
    .markdown code, .note code {
      border-radius: var(--r);
      background: var(--surface-2);
      padding: 0 var(--s1);
    }
    .markdown pre code, .note pre code { padding: 0; background: transparent; }
    .markdown blockquote, .note blockquote {
      margin: var(--s4) 0;
      border-left: 4px solid var(--accent);
      padding-left: var(--s3);
      color: var(--muted);
    }
    @media (max-width: 720px) {
      main { padding: var(--s5) var(--s4) var(--s6); }
      header { align-items: flex-start; flex-direction: column; margin-bottom: var(--s5); }
      .row, .toolbar { align-items: stretch; flex-direction: column; }
      .toolbar label, button, .button { width: 100%; }
      .table-panel { border: 0; background: transparent; box-shadow: none; }
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tr {
        border: 1px solid var(--border);
        border-radius: var(--r);
        background: var(--surface);
        margin-bottom: var(--s4);
        padding: var(--s3);
      }
      td { border: 0; padding: var(--s2) 0; }
      td::before {
        content: attr(data-label);
        display: block;
        color: var(--muted);
        font-size: .74rem;
        font-weight: 750;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      tbody tr:hover { background: var(--surface); }
      .settings-feedback { margin-left: 0; margin-top: var(--s2); }
    }
  </style>
</head>
<body><main>${body}</main><script>
  document.documentElement.classList.add("js");
  for (const form of document.querySelectorAll(".status-form")) {
    const select = form.querySelector(".status-select");
    const button = form.querySelector(".status-save");
    if (!(select instanceof HTMLSelectElement) || !(button instanceof HTMLButtonElement)) continue;
    const initialStatus = form.getAttribute("data-initial-status") || select.value;
    const syncDirtyState = () => form.classList.toggle("is-dirty", select.value !== initialStatus);
    select.addEventListener("change", syncDirtyState);
    form.addEventListener("submit", () => {
      button.disabled = true;
      button.classList.add("is-loading");
      button.setAttribute("aria-busy", "true");
    });
    syncDirtyState();
  }
  for (const row of document.querySelectorAll(".settings-status-row")) {
    const controls = Array.from(row.querySelectorAll(".settings-status-control"));
    const feedback = row.querySelector(".settings-feedback");
    const updateUrl = row.getAttribute("data-update-url");
    if (!updateUrl || !(feedback instanceof HTMLElement)) continue;

    const setFeedback = (state, text) => {
      feedback.className = "settings-feedback" + (state ? " is-" + state : "");
      feedback.textContent = text;
    };

    const save = async (changedControl) => {
      const formData = new FormData();
      for (const control of controls) {
        if (control instanceof HTMLInputElement && control.type === "checkbox") {
          if (control.checked) formData.set(control.name, control.value);
        } else if ((control instanceof HTMLInputElement || control instanceof HTMLSelectElement) && control.name) {
          formData.set(control.name, control.value);
        }
      }

      setFeedback("saving", "Saving");
      for (const control of controls) control.disabled = true;
      try {
        const response = await fetch(updateUrl, { method: "POST", body: formData, credentials: "same-origin", headers: { accept: "application/json" } });
        if (!response.ok) throw new Error("Save failed");
        setFeedback("saved", "Saved");
        if (changedControl instanceof HTMLInputElement && changedControl.type === "checkbox" && changedControl.checked) {
          location.reload();
          return;
        }
        setTimeout(() => setFeedback("", ""), 1200);
      } catch {
        setFeedback("error", "Could not save");
      } finally {
        for (const control of controls) {
          if (control instanceof HTMLInputElement && control.dataset.defaultLocked === "true") continue;
          control.disabled = false;
        }
      }
    };

    for (const control of controls) {
      control.addEventListener("change", () => save(control));
    }
  }
</script></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export function header(projectName: string, options: { links?: boolean; authEnabled?: boolean } = {}): string {
  const links = options.links ?? true;
  const logout = options.authEnabled ? `<form class="nav-form" method="post" action="/logout"><button class="nav-link nav-button" type="submit">Log out</button></form>` : "";
  return `<header><div><a class="brand" href="/">${escapeHtml(projectName)}</a></div>${links ? `<nav class="row"><a class="nav-link" href="/settings">Settings</a><a class="nav-link" href="/api/agent/project">Agent API</a>${logout}</nav>` : ""}</header>`;
}
