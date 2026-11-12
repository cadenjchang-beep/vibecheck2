import type { ApiErrorBody } from '@shared/api';

/** A failed API call, carrying the server's stable error code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** True when the request never reached the server (offline, DNS, timeout). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const isForm = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(withQuery(path, query), {
      method,
      credentials: 'same-origin',
      signal,
      headers: body !== undefined && !isForm ? { 'content-type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', 'You appear to be offline.');
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (!response.ok) {
    const error = (data as ApiErrorBody | undefined)?.error;
    // Better Auth reports errors as { code, message } at the top level.
    const flat = data as { code?: string; message?: string } | undefined;
    throw new ApiError(
      response.status,
      error?.code ?? flat?.code ?? `http_${response.status}`,
      error?.message ?? flat?.message ?? 'Something went wrong.',
      error?.details,
    );
  }
  return data as T;
}
