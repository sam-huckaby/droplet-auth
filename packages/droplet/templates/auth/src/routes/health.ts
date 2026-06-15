import type { Env } from "../types";

export async function handleHealth(env: Env): Promise<Response> {
  const state = env.AUTH_STATE.getByName("global");
  await state.health();
  return Response.json({ ok: true });
}
