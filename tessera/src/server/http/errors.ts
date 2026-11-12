import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** An error that is safe to show to the client. Anything else becomes a 500. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'HttpError';
  }
}

export const badRequest = (code = 'bad_request', message?: string, details?: unknown) =>
  new HttpError(400, code, message, details);
export const unauthorized = () => new HttpError(401, 'unauthorized', 'Sign in to continue.');
export const forbidden = (code = 'forbidden', message?: string) => new HttpError(403, code, message);
/** Also used for things the viewer may not see, so their existence is not revealed. */
export const notFound = (what = 'not_found') => new HttpError(404, what, 'Not found.');
export const conflict = (code: string, message?: string) => new HttpError(409, code, message);
export const tooManyRequests = (retryAfter: number | null, code = 'rate_limited', message?: string) =>
  new HttpError(429, code, message ?? 'Too many requests. Please slow down.', { retryAfter });
export const paymentRequired = (feature: string) =>
  new HttpError(402, 'premium_required', 'This feature is part of Tessera Premium.', { feature });
