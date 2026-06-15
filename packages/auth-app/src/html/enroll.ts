import { escapeHtml, htmlPage } from "./layout";
import { webauthnScript } from "./scripts";
import type { EnrollmentLinkRecord } from "../types";

export function enrollmentPage(rawToken: string, link: EnrollmentLinkRecord): Response {
  return htmlPage(
    "Enroll Passkey",
    `<section class="panel">
      <h1>Enroll passkey</h1>
      ${link.createsAdminPasskey ? "<p><strong>This enrollment link will create an admin passkey.</strong></p>" : ""}
      ${!link.createsAdminPasskey && link.appId ? `<p>This passkey will grant access to <code>${escapeHtml(link.appId)}</code>.</p>` : ""}
      <label>Email <input id="email" type="email" value="${escapeHtml(link.defaultEmail ?? "")}" required></label>
      <label>Label <input id="label" value="${escapeHtml(link.defaultLabel ?? "")}" required></label>
      <button id="register">Register passkey</button>
    </section>
    ${webauthnScript}
    <script>
    document.getElementById('register').addEventListener('click', async () => {
      const body = { token: ${JSON.stringify(rawToken)}, email: document.getElementById('email').value, label: document.getElementById('label').value };
      const start = await fetch('/api/enroll/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
      if (!start.ok) { alert(start.error || 'Unable to start registration'); return; }
      const credential = await navigator.credentials.create(creationOptionsFromJSON(start.options));
      const verify = await fetch('/api/enroll/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: start.challengeId, response: publicKeyCredentialToJSON(credential) }) });
      if (verify.ok) location.href = '/enroll/success'; else alert('Unable to verify passkey');
    });
    </script>`,
  );
}

export function enrollmentErrorPage(): Response {
  return htmlPage("Invalid enrollment link", `<section class="panel"><h1>Invalid link</h1><p>This enrollment link is invalid or has expired.</p></section>`);
}

export function enrollmentSuccessPage(): Response {
  return htmlPage(
    "Passkey enrolled",
    `<section class="panel">
      <h1>Passkey enrolled</h1>
      <p>Your passkey is ready.</p>
      <p>If you enrolled an admin passkey from bootstrap recovery, log out of bootstrap recovery and sign back in with your new passkey.</p>
      <form method="post" action="/api/admin/logout"><button type="submit">Log out and sign in with passkey</button></form>
    </section>`,
  );
}
