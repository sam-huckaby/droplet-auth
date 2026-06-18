function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

const bytes = new Uint8Array(32);
crypto.getRandomValues(bytes);
const key = `droplet_agent_${bytesToBase64Url(bytes)}`;

console.log("Generated AGENT_API_KEY:\n");
console.log(key);
console.log("\nSet this as your AGENT_API_KEY secret/environment variable.");
