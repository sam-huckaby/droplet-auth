export const webauthnScript = `<script>
function b64urlToBytes(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
function bytesToB64url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function publicKeyCredentialToJSON(credential) {
  const response = credential.response;
  const json = {
    id: credential.id,
    rawId: bytesToB64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      clientDataJSON: bytesToB64url(response.clientDataJSON)
    }
  };
  if (response.attestationObject) json.response.attestationObject = bytesToB64url(response.attestationObject);
  if (response.authenticatorData) json.response.authenticatorData = bytesToB64url(response.authenticatorData);
  if (response.signature) json.response.signature = bytesToB64url(response.signature);
  if (response.userHandle) json.response.userHandle = bytesToB64url(response.userHandle);
  if (typeof response.getTransports === 'function') json.response.transports = response.getTransports();
  return json;
}
function creationOptionsFromJSON(options) {
  if (PublicKeyCredential.parseCreationOptionsFromJSON) return { publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options) };
  return { publicKey: { ...options, challenge: b64urlToBytes(options.challenge), user: { ...options.user, id: b64urlToBytes(options.user.id) }, excludeCredentials: (options.excludeCredentials || []).map(c => ({ ...c, id: b64urlToBytes(c.id) })) } };
}
function requestOptionsFromJSON(options) {
  if (PublicKeyCredential.parseRequestOptionsFromJSON) return { publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options) };
  return { publicKey: { ...options, challenge: b64urlToBytes(options.challenge), allowCredentials: (options.allowCredentials || []).map(c => ({ ...c, id: b64urlToBytes(c.id) })) } };
}
</script>`;
