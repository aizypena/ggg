export type ApiError = { code: string; message: string };

export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Success envelope. Defaults to HTTP 200. */
export function ok<T>(data: T, status = 200): Response {
  const body: ApiEnvelope<T> = { ok: true, data };
  return Response.json(body, { status });
}

/** Error envelope. Defaults to HTTP 400. Never leak internal details into `message`. */
export function err(code: string, message: string, status = 400): Response {
  const body: ApiEnvelope<never> = { ok: false, error: { code, message } };
  return Response.json(body, { status });
}
