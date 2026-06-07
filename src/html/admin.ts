import { ADMIN_SESSION_COOKIE, BOOTSTRAP_SESSION_COOKIE, clearCookie } from "../crypto/cookies";
import { escapeHtml, htmlPage } from "./layout";
import { webauthnScript } from "./scripts";
import type { AppUsageSummary, AuditEventRecord, PasskeyRecord, PasskeyUsageSummary } from "../types";

export function adminLoginPage(allowBootstrap: boolean): Response {
  return htmlPage(
    "Droplet Auth Admin",
    `<section class="panel panel-narrow panel-centered">
      <h1>Admin</h1>
      <p>Sign in with an admin passkey.</p>
      <button class="button-primary" id="admin-passkey">Use admin passkey</button>
      ${allowBootstrap ? `<hr style="width:100%;"><form method="post" action="/api/admin/bootstrap-login"><label>Bootstrap password <input type="password" name="password" autocomplete="current-password" required></label><button type="submit">Use bootstrap password</button></form>` : ""}
    </section>
    ${webauthnScript}
    <script>
    document.getElementById('admin-passkey').addEventListener('click', async () => {
      const start = await fetch('/api/admin/passkey/options', { method: 'POST' }).then(r => r.json());
      if (!start.ok) throw new Error(start.error || 'Unable to start passkey login');
      const credential = await navigator.credentials.get(requestOptionsFromJSON(start.options));
      const verify = await fetch('/api/admin/passkey/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: start.challengeId, response: publicKeyCredentialToJSON(credential) }) });
      if (verify.ok) location.href = '/admin'; else alert('Unable to verify passkey');
    });
    </script>`,
  );
}

export function bootstrapAdminPage(): Response {
  return htmlPage(
    "Bootstrap Admin",
    `<section class="panel panel-narrow">
      <h1>Bootstrap recovery</h1>
      <p>You are signed in with the bootstrap password. Create your first admin passkey, then set <code>ALLOW_BOOTSTRAP_PW=false</code>.</p>
      <p>If you already enrolled your admin passkey, log out of bootstrap recovery and sign back in with your passkey.</p>
      <form method="post" action="/api/admin/bootstrap-enrollment-link"><button type="submit">Create and open first admin enrollment link</button></form>
      <form method="post" action="/api/admin/logout"><button type="submit">Log out of bootstrap recovery</button></form>
    </section>`,
  );
}

export function adminDashboard(passkeys: PasskeyRecord[], audit: AuditEventRecord[], usage: { passkeys: PasskeyUsageSummary[]; apps: AppUsageSummary[] }, createdLink?: string): Response {
  const rows = passkeys
    .map(
      (passkey) => `<tr>
        <td><input data-passkey-label="${escapeHtml(passkey.id)}" value="${escapeHtml(passkey.label)}"></td>
        <td><input data-passkey-email="${escapeHtml(passkey.id)}" type="email" value="${escapeHtml(passkey.email)}"></td>
        <td>${passkey.isAdmin ? badge("Admin", "green") : badge("User", "gray")}</td>
        <td>${formatDateTime(passkey.createdAt)}</td><td>${formatDateTime(passkey.lastUsedAt)}</td><td>${passkey.revokedAt ? badge("Revoked", "red") : badge("Active", "green")}</td>
        <td><div class="actions"><button class="icon-button icon-save" data-passkey-save="${escapeHtml(passkey.id)}" type="button" aria-label="Save passkey changes" title="Save changes">✓</button><form method="post" action="/api/admin/passkeys/${encodeURIComponent(passkey.id)}/revoke"><button class="icon-button icon-revoke" type="submit" aria-label="Revoke passkey" title="Revoke passkey">✕</button></form></div></td>
      </tr>`,
    )
    .join("");
  const auditRows = audit
    .map((event) => `<tr><td>${formatDateTime(event.createdAt)}</td><td>${escapeHtml(event.eventType)}</td><td>${escapeHtml(event.appId ?? "")}</td><td>${escapeHtml(event.email ?? "")}</td></tr>`)
    .join("");
  const passkeyUsageRows = usage.passkeys
    .map((item) => `<tr><td>${escapeHtml(item.email ?? "")}</td><td>${escapeHtml(item.appId)}</td><td>${item.totalLogins}</td><td>${formatDateTime(item.lastLoginAt)}</td></tr>`)
    .join("");
  const appUsageRows = usage.apps
    .map((item) => `<tr><td>${escapeHtml(item.appId)}</td><td>${item.totalLogins}</td><td>${item.uniquePasskeys}</td><td>${formatDateTime(item.lastLoginAt)}</td></tr>`)
    .join("");

  return htmlPage(
    "Droplet Auth Admin",
    `<section class="admin-shell">
      <div class="admin-header">
        <div><h1>Droplet Auth</h1><p>Manage passkeys, enrollment links, and recent authentication activity.</p></div>
        <form method="post" action="/api/admin/logout"><button class="button-muted" type="submit">Log out</button></form>
      </div>
      ${createdLink ? `<div class="card notice"><div class="card-header"><h2>Enrollment link</h2><p>This raw link is shown once.</p></div><div class="card-body"><a href="${escapeHtml(createdLink)}">${escapeHtml(createdLink)}</a></div></div>` : ""}
      <div class="card"><div class="card-header"><h2>Create enrollment link</h2><p>Enrollment links are single-use. Use the admin option only for passkeys that should manage this portal.</p></div><div class="card-body"><form class="form-grid" method="post" action="/api/admin/enrollment-links">
        <label>Email <input name="defaultEmail" type="email" placeholder="person@example.com"></label>
        <label>Label <input name="defaultLabel" placeholder="MacBook, iPhone, Security key"></label>
        <label class="checkbox-row"><input name="createsAdminPasskey" type="checkbox" value="true"> Admin passkey?</label>
        <button class="button-primary" type="submit">Create enrollment link</button>
      </form></div></div>
      ${tableCard("Passkeys", "Update passkey labels and emails, or revoke credentials that should no longer authenticate.", `<table><thead><tr><th>Label</th><th>Email</th><th>Role</th><th>Created</th><th>Last used</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || emptyRow(7, "No passkeys yet.")}</tbody></table>`)}
      ${tableCard("Passkey usage by app", "See which enrolled emails are being used with each protected app.", `<table><thead><tr><th>Email</th><th>App</th><th>Total logins</th><th>Last login</th></tr></thead><tbody>${passkeyUsageRows || emptyRow(4, "No app logins yet.")}</tbody></table>`)}
      ${tableCard("App usage", "High-level login activity grouped by protected app.", `<table><thead><tr><th>App</th><th>Total logins</th><th>Unique passkeys</th><th>Last login</th></tr></thead><tbody>${appUsageRows || emptyRow(4, "No app logins yet.")}</tbody></table>`)}
      ${tableCard("Recent audit", "Recent authentication and administration events.", `<table><thead><tr><th>Time</th><th>Event</th><th>App</th><th>Email</th></tr></thead><tbody>${auditRows || emptyRow(4, "No audit events yet.")}</tbody></table>`)}
    </section>
    <script>
    for (const button of document.querySelectorAll('[data-passkey-save]')) {
      button.addEventListener('click', async () => {
        const id = button.getAttribute('data-passkey-save');
        const email = document.querySelector('[data-passkey-email="' + CSS.escape(id) + '"]').value;
        const label = document.querySelector('[data-passkey-label="' + CSS.escape(id) + '"]').value;
        const response = await fetch('/api/admin/passkeys/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, label }) });
        if (response.ok) location.reload(); else alert('Unable to update passkey');
      });
    }
    </script>`,
  );
}

function tableCard(title: string, description: string, table: string): string {
  return `<div class="card"><div class="card-header"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><div class="table-wrap">${table}</div></div>`;
}

function emptyRow(colspan: number, message: string): string {
  return `<tr><td class="empty" colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

function badge(label: string, color: "green" | "red" | "amber" | "gray"): string {
  return `<span class="badge badge-${color}">${escapeHtml(label)}</span>`;
}

function formatDateTime(value: string | null): string {
  if (!value) return `<span class="muted">Never</span>`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return `<time datetime="${escapeHtml(value)}" title="${escapeHtml(value)}">${escapeHtml(
    new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
  )}</time>`;
}

export function logoutResponse(): Response {
  const headers = new Headers({ location: "/admin" });
  headers.append("set-cookie", clearCookie(ADMIN_SESSION_COOKIE));
  headers.append("set-cookie", clearCookie(BOOTSTRAP_SESSION_COOKIE));
  return new Response(null, { status: 303, headers });
}
