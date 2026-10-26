// Small HTTP helpers shared by every endpoint.

export interface Env {
  DB: D1Database;
  TOKEN_SECRET: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: Record<string, string>) =>
  new HttpError(400, 'validation_error', message, details);
export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);
export const forbidden = () => new HttpError(403, 'forbidden', 'You are not allowed to do this');

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  console.error(err);
  return json({ error: { code: 'server_error', message: 'Unexpected server error' } }, 500);
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return body as T;
  } catch {
    throw badRequest('The request body must be a JSON object');
  }
}

/** Reads a query parameter as a positive integer with bounds. */
export function intParam(url: URL, name: string, fallback: number, min: number, max: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`"${name}" must be an integer between ${min} and ${max}`);
  return n;
}

export const nowIso = () => new Date().toISOString();
export const round2 = (n: number) => Math.round(n * 100) / 100;
