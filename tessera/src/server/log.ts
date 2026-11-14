import pino from 'pino';
import { env } from './env';

/**
 * Structured JSON logs in production, readable logs in development.
 * Secrets and credentials are redacted wherever they might be logged.
 */
export const log = pino({
  level: env.isTest ? (process.env.LOG_LEVEL ?? 'silent') : env.LOG_LEVEL,
  base: { service: 'tessera' },
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'authorization',
      'cookie',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[redacted]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' } }
      : undefined,
});

export type Logger = typeof log;

/**
 * Single place errors are reported from. Always logs; additionally forwards to
 * ERROR_WEBHOOK_URL when configured so an external tracker can pick them up.
 */
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  const error = err instanceof Error ? err : new Error(String(err));
  log.error({ err: error, ...context }, error.message);
  if (!env.ERROR_WEBHOOK_URL) return;
  const body = JSON.stringify({
    service: 'tessera',
    environment: env.NODE_ENV,
    message: error.message,
    name: error.name,
    stack: error.stack,
    context,
    at: new Date().toISOString(),
  });
  fetch(env.ERROR_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch((e) => log.warn({ err: e }, 'error webhook delivery failed'));
}
