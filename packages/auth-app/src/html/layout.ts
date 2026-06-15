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
    :root {
      color-scheme: light dark;
      --bg: #f6f7f9;
      --surface: #ffffff;
      --surface-soft: #f9fafb;
      --border: #d9dee7;
      --border-soft: #edf0f4;
      --text: #172033;
      --muted: #647084;
      --accent: #2563eb;
      --green: #15803d;
      --green-bg: #dcfce7;
      --red: #b91c1c;
      --red-bg: #fee2e2;
      --amber: #b45309;
      --amber-bg: #fef3c7;
      --notice-bg: #eff6ff;
      --panel-shadow: 0 12px 28px rgb(15 23 42 / 0.05);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b1120;
        --surface: #111827;
        --surface-soft: #172033;
        --border: #334155;
        --border-soft: #233047;
        --text: #e5edf8;
        --muted: #9aa7bb;
        --accent: #ad4823;
        --green: #86efac;
        --green-bg: #052e1a;
        --red: #fca5a5;
        --red-bg: #3f1114;
        --amber: #fcd34d;
        --amber-bg: #3a2606;
        --notice-bg: #0d2242;
        --panel-shadow: 0 16px 34px rgb(0 0 0 / 0.24);
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); }
    main { width: min(96vw, 1180px); margin: 0 auto; padding: 2rem 0 3rem; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { font-size: clamp(2rem, 4vw, 3rem); letter-spacing: -0.04em; margin-bottom: 0.4rem; }
    h2 { font-size: 1.05rem; margin-bottom: 0.35rem; }
    p { color: var(--muted); line-height: 1.55; }
    a { color: var(--accent); }
    button, input, select { font: inherit; }
    input, select { width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 0.55rem 0.7rem; background: var(--surface); color: var(--text); }
    input:focus, select:focus { outline: 2px solid color-mix(in srgb, var(--accent) 22%, transparent); border-color: var(--accent); }
    label { display: grid; gap: 0.35rem; color: var(--muted); font-size: 0.9rem; }
    button { border: 1px solid var(--border); border-radius: 10px; padding: 0.55rem 0.85rem; background: var(--surface); color: var(--text); cursor: pointer; }
    button:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th { text-align: left; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); background: var(--surface-soft); }
    th, td { padding: 0.8rem 0.9rem; border-bottom: 1px solid var(--border-soft); vertical-align: middle; }
    tbody tr:hover { background: color-mix(in srgb, var(--surface-soft) 70%, transparent); }
    code { border: 1px solid var(--border-soft); border-radius: 6px; padding: 0.1rem 0.3rem; background: var(--surface-soft); }
    .panel, .card { border: 1px solid var(--border); border-radius: 18px; background: var(--surface); box-shadow: var(--panel-shadow); }
    .panel { padding: 2rem; }
    .panel-centered { display: flex; flex-direction: column; align-items: center; }
    .panel-narrow { width: min(92vw, 34rem); margin: 12vh auto 0; }
    .admin-shell { display: grid; gap: 1.2rem; }
    .admin-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 0.4rem; }
    .admin-header p { margin-bottom: 0; }
    .card { overflow: hidden; }
    .card-header { padding: 1.1rem 1.25rem 0.8rem; border-bottom: 1px solid var(--border-soft); background: linear-gradient(180deg, var(--surface), var(--surface-soft)); }
    .card-header p { margin-bottom: 0; font-size: 0.92rem; }
    .card-body { padding: 1.2rem 1.25rem; }
    .table-wrap { overflow-x: auto; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; align-items: end; }
    .enrollment-form { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .checkbox-row { display: flex; align-items: center; gap: 0.5rem; color: var(--text); }
    .checkbox-row input { width: auto; }
    .button-primary { background: var(--accent); border-color: var(--accent); color: white; }
    .button-muted { color: var(--muted); }
    .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.22rem 0.55rem; font-size: 0.78rem; font-weight: 650; white-space: nowrap; }
    .badge-green { background: var(--green-bg); color: var(--green); }
    .badge-red { background: var(--red-bg); color: var(--red); }
    .badge-amber { background: var(--amber-bg); color: var(--amber); }
    .badge-gray { background: var(--surface-soft); color: var(--muted); border: 1px solid var(--border-soft); }
    .actions { display: flex; gap: 0.45rem; align-items: center; }
    .actions form { margin: 0; }
    .editable-field { display: grid; grid-template-columns: minmax(12rem, 1fr) 4.6rem; gap: 0.45rem; align-items: center; min-width: 18rem; }
    .field-action-slot { width: 4.6rem; min-height: 2.25rem; display: grid; place-items: center; }
    .field-save { width: 100%; padding-inline: 0.65rem; color: var(--green); border-color: color-mix(in srgb, var(--green) 45%, var(--border)); background: var(--green-bg); }
    .field-saved { color: var(--green); font-weight: 800; }
    .button-revoke { color: var(--red); border-color: color-mix(in srgb, var(--red) 45%, var(--border)); background: var(--red-bg); }
    .pagination { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: end; justify-content: space-between; margin-top: 0.85rem; }
    .pagination form { margin: 0; }
    .pagination label { min-width: 10rem; }
    .pagination-actions { display: flex; gap: 0.45rem; align-items: center; }
    .pagination-link { border: 1px solid var(--border); border-radius: 10px; padding: 0.55rem 0.85rem; background: var(--surface); color: var(--text); text-decoration: none; font-size: 0.9rem; }
    .pagination-link:not(.disabled):hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
    .pagination-link.disabled { color: var(--muted); opacity: 0.7; cursor: default; }
    .muted { color: var(--muted); }
    .empty { text-align: center; color: var(--muted); padding: 1.6rem; }
    .notice { border-color: color-mix(in srgb, var(--accent) 28%, var(--border)); background: var(--notice-bg); }
    @media (max-width: 760px) {
      main { width: min(94vw, 100%); padding: 1rem 0 2rem; }
      .admin-header, .form-grid { grid-template-columns: 1fr; display: grid; }
      th, td { padding: 0.7rem; }
    }
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
