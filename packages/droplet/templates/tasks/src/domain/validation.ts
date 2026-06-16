import type { AppError, Result } from "../types";

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(code: string, message: string, details?: unknown): Result<T> {
  return { ok: false, error: { code, message, details } };
}

export function errorResponse(error: AppError, status = 400): Response {
  return Response.json({ ok: false, error }, { status });
}

export function validateTitle(title: unknown): Result<string> {
  if (typeof title !== "string") return fail("VALIDATION_ERROR", "Title is required.");
  const trimmed = title.trim();
  if (!trimmed) return fail("VALIDATION_ERROR", "Title is required.");
  if (trimmed.length > 200) return fail("VALIDATION_ERROR", "Title must be 200 characters or fewer.");
  return ok(trimmed);
}

export function validateMarkdown(value: unknown, field: string, maxLength: number): Result<string> {
  if (value == null) return ok("");
  if (typeof value !== "string") return fail("VALIDATION_ERROR", `${field} must be a string.`);
  if (value.length > maxLength) return fail("VALIDATION_ERROR", `${field} is too long.`);
  return ok(value);
}

export function validateRequiredMarkdown(value: unknown, field: string, maxLength: number): Result<string> {
  const result = validateMarkdown(value, field, maxLength);
  if (!result.ok) return result;
  if (!result.value?.trim()) return fail("VALIDATION_ERROR", `${field} is required.`);
  return result;
}
