import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ZodType } from 'zod';
import { isChildBirth } from '@shared/age';
import type { ConsentStatus, Plan, ReminderChannel, Role } from '@shared/constants';
import { effectivePlan, entitlementsFor, type Entitlements } from '@shared/entitlements';
import { auth } from '../auth';
import { env } from '../env';
import { log, type Logger } from '../log';
import { newId } from '../ids';
import { badRequest, forbidden, unauthorized } from './errors';

/** The signed-in person making the request, with plan and age rules resolved. */
export interface Viewer {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: Role;
  plan: Plan;
  entitlements: Entitlements;
  consentStatus: ConsentStatus;
  onboarded: boolean;
  isChild: boolean;
  locale: string;
  timezone: string;
  dailyGoal: number;
  reminderChannel: ReminderChannel;
  reminderHour: number;
  createdAt: Date;
}

export type AppEnv = {
  Variables: {
    requestId: string;
    log: Logger;
    viewer: Viewer | null;
  };
};
export type Ctx = Context<AppEnv>;

/** The user columns a viewer is built from; satisfied by a session user and by a `users` row. */
export interface ViewerSource {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: string;
  plan: string;
  planExpiresAt?: Date | null;
  birthYear?: number | null;
  birthMonth?: number | null;
  consentStatus: string;
  onboardedAt?: Date | null;
  locale: string;
  timezone: string;
  dailyGoal: number;
  reminderChannel: string;
  reminderHour: number;
  createdAt: Date;
}

export function toViewer(user: ViewerSource): Viewer {
  const plan = effectivePlan(user.plan, user.planExpiresAt);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image ?? null,
    role: user.role === 'teacher' ? 'teacher' : 'student',
    plan,
    entitlements: entitlementsFor(plan),
    consentStatus: user.consentStatus as ConsentStatus,
    onboarded: Boolean(user.onboardedAt),
    isChild: isChildBirth(user.birthYear, user.birthMonth),
    locale: user.locale,
    timezone: user.timezone,
    dailyGoal: user.dailyGoal,
    reminderChannel: user.reminderChannel as ReminderChannel,
    reminderHour: user.reminderHour,
    createdAt: user.createdAt,
  };
}

export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header('x-request-id')?.slice(0, 64) || newId(12);
  c.set('requestId', requestId);
  c.set('log', log.child({ requestId }));
  c.set('viewer', null);
  c.header('x-request-id', requestId);
  const started = performance.now();
  await next();
  // Paths only: query strings and emailed tokens stay out of the logs.
  const path = c.req.path.replace(/\/(consent|reset-password)\/[^/]+/, '/$1/:token');
  c.get('log').info(
    {
      method: c.req.method,
      path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
      userId: c.get('viewer')?.id,
    },
    'request',
  );
});

/** Resolves the session cookie to a viewer and forwards any refreshed cookie. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const cookie = c.req.header('cookie');
  if (!cookie || !cookie.includes('tessera')) return next();
  const result = await auth.api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
  if (result.response) c.set('viewer', toViewer(result.response.user));
  await next();
  for (const value of result.headers.getSetCookie()) c.header('set-cookie', value, { append: true });
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ORIGIN_EXEMPT = ['/api/billing/webhook', '/api/internal/'];

/**
 * CSRF defence in depth. Session cookies are SameSite=Lax already; on top of
 * that every state-changing request must come from our own origin.
 */
export const originGuard = createMiddleware<AppEnv>(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  if (ORIGIN_EXEMPT.some((p) => c.req.path.startsWith(p))) return next();
  const origin = c.req.header('origin');
  const site = c.req.header('sec-fetch-site');
  if (origin ? origin !== env.appUrl : Boolean(site && site !== 'same-origin' && site !== 'none')) {
    throw forbidden('bad_origin', 'Cross-site request blocked.');
  }
  return next();
});

/** Any signed-in user, including one who has not finished onboarding. */
export function requireSession(c: Ctx): Viewer {
  const viewer = c.get('viewer');
  if (!viewer) throw unauthorized();
  return viewer;
}

/** A signed-in user who may use the app: onboarded, and approved if under 13. */
export function requireViewer(c: Ctx): Viewer {
  const viewer = requireSession(c);
  if (!viewer.onboarded) throw forbidden('onboarding_required', 'Finish setting up your account first.');
  if (viewer.consentStatus === 'pending') {
    throw forbidden('consent_required', 'A parent or guardian needs to approve this account first.');
  }
  return viewer;
}

/** The viewer if they may use the app, otherwise null (treated as a visitor). */
export function optionalViewer(c: Ctx): Viewer | null {
  const viewer = c.get('viewer');
  if (!viewer || !viewer.onboarded || viewer.consentStatus === 'pending') return null;
  return viewer;
}

export function requireVerified(viewer: Viewer): void {
  if (!viewer.emailVerified) {
    throw forbidden('email_unverified', 'Confirm your email address to do this.');
  }
}

/** Parses and validates a JSON body. Validation failures become a 400 with field details. */
export async function parseJson<T>(c: Ctx, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest('invalid_json', 'The request body is not valid JSON.');
  }
  return parseWith(schema, raw);
}

export function parseQuery<T>(c: Ctx, schema: ZodType<T>): T {
  return parseWith(schema, c.req.query());
}

export function parseWith<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(
      'validation_error',
      'Some of the information sent was not valid.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

/** Best-effort client address for rate limits when there is no signed-in user. */
export function clientIp(c: Ctx): string {
  if (env.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}
