import type { JsonError } from "./types";

export function jsonOk(data: Record<string, unknown> = {}): Response {
  return Response.json({ ok: true, ...data });
}

export function jsonError(error: JsonError, status = 400): Response {
  return Response.json({ ok: false, error }, { status });
}

export async function readJsonObject(request: Request): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return { ok: false, response: jsonError({ code: "invalid_request", message: "Expected application/json request body." }, 400) };
  }
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return { ok: true, value: body as Record<string, unknown> };
  } catch {
    return { ok: false, response: jsonError({ code: "invalid_request", message: "Request body contains invalid JSON." }, 400) };
  }
  return { ok: false, response: jsonError({ code: "invalid_request", message: "JSON body must be an object." }, 400) };
}

export function stringField(body: Record<string, unknown>, name: string): string | null {
  const value = body[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}
