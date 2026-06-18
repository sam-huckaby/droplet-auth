import { jsonError } from "../http";

export async function requireAgentApiKey(request: Request, expected: string): Promise<Response | null> {
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return jsonError({ code: "unauthorized", message: "Agent API key is required." }, 401);
  const provided = header.slice(prefix.length);
  if (!(await constantTimeEqual(provided, expected))) return jsonError({ code: "forbidden", message: "Agent API key is invalid." }, 403);
  return null;
}

export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [aHash, bHash] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(a)), crypto.subtle.digest("SHA-256", encoder.encode(b))]);
  const left = new Uint8Array(aHash);
  const right = new Uint8Array(bHash);
  let diff = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return diff === 0;
}

export function isAgentApiKeyShape(value: string): boolean {
  return /^droplet_agent_[A-Za-z0-9_-]{43,}$/.test(value);
}
