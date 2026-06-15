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

export function adminDashboard(
  passkeys: PasskeyRecord[],
  audit: AuditEventRecord[],
  usage: { passkeys: PasskeyUsageSummary[]; apps: AppUsageSummary[] },
  appIds: string[],
  auditPagination: { page: number; pageSize: 50 | 100 | 500; total: number },
  createdLink?: string,
): Response {
  const appOptions = appIds.map((appId) => `<option value="${escapeHtml(appId)}">${escapeHtml(appId)}</option>`).join("");
  const rows = passkeys
    .map(
      (passkey) => `<tr>
        <td>${editableField(passkey.id, "label", passkey.label)}</td>
        <td>${editableField(passkey.id, "email", passkey.email, "email")}</td>
        <td>${passkey.isAdmin ? badge("Admin", "green") : badge("User", "gray")}</td>
        <td>${passkeyAccess(passkey)}</td>
        <td>${formatDateTime(passkey.createdAt)}</td><td>${formatDateTime(passkey.lastUsedAt)}</td><td>${passkey.revokedAt ? badge("Revoked", "red") : badge("Active", "green")}</td>
        <td><div class="actions"><form method="post" action="/api/admin/passkeys/${encodeURIComponent(passkey.id)}/revoke"><button class="button-revoke" type="submit">Revoke</button></form></div></td>
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
      <div class="card"><div class="card-header"><h2>Create enrollment link</h2><p>Enrollment links are single-use. Non-admin passkeys must be scoped to one app.</p></div><div class="card-body"><form class="form-grid enrollment-form" method="post" action="/api/admin/enrollment-links">
        <label>Email <input name="defaultEmail" type="email" placeholder="person@example.com"></label>
        <label>Label <input name="defaultLabel" placeholder="MacBook, iPhone, Security key"></label>
        <label data-app-scope-field>App access <select name="appId" required>${appOptions}</select></label>
        <label class="checkbox-row"><input name="createsAdminPasskey" type="checkbox" value="true"> Admin passkey?</label>
        <button class="button-primary" type="submit">Create enrollment link</button>
      </form></div></div>
      ${tableCard("Passkeys", "Update passkey labels and emails, or revoke credentials that should no longer authenticate.", `<table><thead><tr><th>Label</th><th>Email</th><th>Role</th><th>Access</th><th>Created</th><th>Last used</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || emptyRow(8, "No passkeys yet.")}</tbody></table>`)}
      ${tableCard("Passkey usage by app", "See which enrolled emails are being used with each protected app.", `<table><thead><tr><th>Email</th><th>App</th><th>Total logins</th><th>Last login</th></tr></thead><tbody>${passkeyUsageRows || emptyRow(4, "No app logins yet.")}</tbody></table>`)}
      ${tableCard("App usage", "High-level login activity grouped by protected app.", `<table><thead><tr><th>App</th><th>Total logins</th><th>Unique passkeys</th><th>Last login</th></tr></thead><tbody>${appUsageRows || emptyRow(4, "No app logins yet.")}</tbody></table>`)}
      ${auditCard("Recent audit", "Recent authentication and administration events.", `<table><thead><tr><th>Time</th><th>Event</th><th>App</th><th>Email</th></tr></thead><tbody>${auditRows || emptyRow(4, "No audit events yet.")}</tbody></table>`, auditPagination)}
    </section>
    <script>
    for (const field of document.querySelectorAll('[data-editable-field]')) {
      const input = field.querySelector('input');
      const save = field.querySelector('[data-field-save]');
      const saved = field.querySelector('[data-field-saved]');
      if (!input || !save || !saved) continue;
      let savedTimer;
      function syncFieldState() {
        clearTimeout(savedTimer);
        saved.hidden = true;
        save.hidden = input.value === input.dataset.originalValue;
      }
      input.addEventListener('input', syncFieldState);
      save.addEventListener('click', async () => {
        const id = field.getAttribute('data-passkey-id');
        const fieldName = field.getAttribute('data-field-name');
        if (!id || !fieldName) return;
        const value = input.value;
        save.disabled = true;
        const response = await fetch('/api/admin/passkeys/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [fieldName]: value }) });
        save.disabled = false;
        if (!response.ok) { alert('Unable to update passkey'); syncFieldState(); return; }
        input.dataset.originalValue = value;
        if (input.value === value) {
          save.hidden = true;
          saved.hidden = false;
          savedTimer = setTimeout(() => { saved.hidden = true; }, 3000);
        } else {
          syncFieldState();
        }
      });
      syncFieldState();
    }
    const adminCheckbox = document.querySelector('input[name="createsAdminPasskey"]');
    const appScopeField = document.querySelector('[data-app-scope-field]');
    const appScopeSelect = appScopeField?.querySelector('select');
    function syncAppScopeField() {
      const isAdmin = adminCheckbox?.checked ?? false;
      if (appScopeField) appScopeField.hidden = isAdmin;
      if (appScopeSelect) appScopeSelect.disabled = isAdmin;
    }
    adminCheckbox?.addEventListener('change', syncAppScopeField);
    syncAppScopeField();
    </script>`,
  );
}

function tableCard(title: string, description: string, table: string): string {
  return `<div class="card"><div class="card-header"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><div class="table-wrap">${table}</div></div>`;
}

function auditCard(title: string, description: string, table: string, pagination: { page: number; pageSize: 50 | 100 | 500; total: number }): string {
  return `<div class="card"><div class="card-header"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>${auditPaginationControls(pagination)}</div><div class="table-wrap">${table}</div></div>`;
}

function auditPaginationControls(pagination: { page: number; pageSize: 50 | 100 | 500; total: number }): string {
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
  const previous = pagination.page > 1 ? `<a class="pagination-link" href="${auditPageUrl(pagination.page - 1, pagination.pageSize)}">Previous</a>` : `<span class="pagination-link disabled">Previous</span>`;
  const next = pagination.page < totalPages ? `<a class="pagination-link" href="${auditPageUrl(pagination.page + 1, pagination.pageSize)}">Next</a>` : `<span class="pagination-link disabled">Next</span>`;
  const pageSizeOptions = [50, 100, 500]
    .map((size) => `<option value="${size}"${size === pagination.pageSize ? " selected" : ""}>${size}</option>`)
    .join("");
  const status = pagination.total === 0 ? "No audit events" : `Page ${pagination.page} of ${totalPages}`;
  return `<div class="pagination"><form method="get" action="/admin"><input type="hidden" name="auditPage" value="1"><label>Events per page <select name="auditPageSize" onchange="this.form.submit()">${pageSizeOptions}</select></label></form><span class="muted">${escapeHtml(status)}</span><div class="pagination-actions">${previous}${next}</div></div>`;
}

function auditPageUrl(page: number, pageSize: number): string {
  return `/admin?auditPage=${page}&auditPageSize=${pageSize}`;
}

function emptyRow(colspan: number, message: string): string {
  return `<tr><td class="empty" colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

function badge(label: string, color: "green" | "red" | "amber" | "gray"): string {
  return `<span class="badge badge-${color}">${escapeHtml(label)}</span>`;
}

function editableField(passkeyId: string, fieldName: "label" | "email", value: string, type = "text"): string {
  return `<div class="editable-field" data-editable-field data-passkey-id="${escapeHtml(passkeyId)}" data-field-name="${fieldName}"><input data-passkey-${fieldName}="${escapeHtml(passkeyId)}" data-original-value="${escapeHtml(value)}" type="${type}" value="${escapeHtml(value)}"><span class="field-action-slot"><button class="field-save" data-field-save type="button" hidden>Save</button><span class="field-saved" data-field-saved hidden aria-live="polite">✓</span></span></div>`;
}

function passkeyAccess(passkey: PasskeyRecord): string {
  if (passkey.isAdmin) return badge("All apps", "green");
  if (passkey.appId) return `<code>${escapeHtml(passkey.appId)}</code>`;
  return badge("No app access", "amber");
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
