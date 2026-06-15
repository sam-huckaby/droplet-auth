import { escapeHtml, htmlPage } from "./layout";
import { webauthnScript } from "./scripts";

export function loginPage(appId: string, returnTo: string): Response {
  return htmlPage(
    "Sign in",
    `<section class="panel">
      <h1>Sign in</h1>
      <p>App: ${escapeHtml(appId)}</p>
      <p>Choose one of your passkeys for this domain.</p>
      <button id="login">Use passkey</button>
    </section>
    ${webauthnScript}
    <script>
    document.getElementById('login').addEventListener('click', async () => {
      const start = await fetch('/api/login/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appId: ${JSON.stringify(appId)}, returnTo: ${JSON.stringify(returnTo)} }) }).then(r => r.json());
      if (!start.ok) { alert(start.error || 'Unable to start login'); return; }
      const credential = await navigator.credentials.get(requestOptionsFromJSON(start.options));
      const verify = await fetch('/api/login/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId: start.challengeId, response: publicKeyCredentialToJSON(credential) }) }).then(r => r.json());
      if (verify.ok) location.href = verify.redirectTo; else alert(verify.error || 'Unable to verify passkey');
    });
    </script>`,
  );
}
