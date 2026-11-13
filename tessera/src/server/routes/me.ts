import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { isChildBirth } from '@shared/age';
import type { Features, MeResponse, MeUser } from '@shared/api';
import { DAILY_GOAL_OPTIONS, LIMITS, REMINDER_CHANNELS, ROLES, UI_LOCALES } from '@shared/constants';
import { entitlementsFor } from '@shared/entitlements';
import { db } from '../db/client';
import { accounts, parentalConsents, users } from '../db/schema';
import { env } from '../env';
import { badRequest, conflict, forbidden, notFound } from '../http/errors';
import { parseJson, requireSession, type AppEnv, type Viewer } from '../http/context';
import { newId, newToken, sha256 } from '../ids';
import { parentalConsentEmail } from '../services/email/templates';
import { sendEmail } from '../services/email/transport';
import { exportAccountData } from '../services/account';
import { enforceRateLimit } from '../services/rate-limit';

export const features: Features = {
  googleAuth: env.googleEnabled,
  ai: env.aiProvider !== 'off',
  aiMock: env.aiProvider === 'mock',
  payments: env.paymentsProvider,
  push: env.pushEnabled,
  vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
};

const CONSENT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezone = z.string().max(64).refine(isValidTimezone, 'Unknown time zone');
const locale = z.enum(UI_LOCALES.map((l) => l.code) as [string, ...string[]]);
const thisYear = () => new Date().getUTCFullYear();

const onboardingSchema = z.object({
  birthYear: z.number().int().min(1900).max(2100),
  birthMonth: z.number().int().min(1).max(12),
  role: z.enum(ROLES),
  parentEmail: z.email().max(254).optional(),
  timezone: timezone.optional(),
  locale: locale.optional(),
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(LIMITS.nameMax),
    role: z.enum(ROLES),
    locale,
    timezone,
    dailyGoal: z.number().int().refine((n) => (DAILY_GOAL_OPTIONS as readonly number[]).includes(n) || (n > 0 && n <= 500)),
    reminderChannel: z.enum(REMINDER_CHANNELS),
    reminderHour: z.number().int().min(0).max(23),
  })
  .partial();

async function toMeUser(viewer: Viewer): Promise<MeUser> {
  const credential = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, viewer.id), eq(accounts.providerId, 'credential')))
    .limit(1);
  return {
    id: viewer.id,
    name: viewer.name,
    email: viewer.email,
    emailVerified: viewer.emailVerified,
    image: viewer.image,
    role: viewer.role,
    plan: viewer.plan,
    consentStatus: viewer.consentStatus,
    onboarded: viewer.onboarded,
    isChild: viewer.isChild,
    locale: viewer.locale,
    timezone: viewer.timezone,
    dailyGoal: viewer.dailyGoal,
    reminderChannel: viewer.reminderChannel,
    reminderHour: viewer.reminderHour,
    hasPassword: credential.length > 0,
    createdAt: viewer.createdAt.toISOString(),
  };
}

async function sendConsentRequest(userId: string, childName: string, parentEmail: string): Promise<void> {
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx
      .update(parentalConsents)
      .set({ status: 'declined', decidedAt: new Date() })
      .where(and(eq(parentalConsents.userId, userId), eq(parentalConsents.status, 'pending')));
    await tx.insert(parentalConsents).values({
      id: newId(),
      userId,
      parentEmail,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + CONSENT_TTL_MS),
    });
  });
  await sendEmail(parentalConsentEmail(parentEmail, childName, `${env.appUrl}/consent/${token}`));
}

export const meRoutes = new Hono<AppEnv>()
  .get('/export', async (c) => {
    const viewer = requireSession(c);
    await enforceRateLimit(`export:${viewer.id}`, { window: 3600, max: 10 });
    const data = await exportAccountData(viewer);
    c.header('content-disposition', `attachment; filename="tessera-export-${new Date().toISOString().slice(0, 10)}.json"`);
    c.header('cache-control', 'no-store');
    return c.json(data);
  })
  .get('/', async (c) => {
    const viewer = c.get('viewer');
    const body: MeResponse = {
      user: viewer ? await toMeUser(viewer) : null,
      entitlements: viewer ? viewer.entitlements : entitlementsFor('free'),
      features,
    };
    return c.json(body);
  })

  /** Age gate and role. Required once for every account, including Google sign-ups. */
  .post('/onboarding', async (c) => {
    const viewer = requireSession(c);
    if (viewer.onboarded && viewer.consentStatus !== 'pending') {
      throw conflict('already_onboarded', 'This account is already set up.');
    }
    const input = await parseJson(c, onboardingSchema);
    if (input.birthYear > thisYear()) throw badRequest('validation_error', 'Birth year is in the future.');

    const child = isChildBirth(input.birthYear, input.birthMonth);
    if (child) {
      if (!input.parentEmail) {
        throw badRequest('parent_email_required', "A parent or guardian's email address is needed.");
      }
      if (input.parentEmail.toLowerCase() === viewer.email.toLowerCase()) {
        throw badRequest('parent_email_same', "Use a parent or guardian's email, not your own.");
      }
      await enforceRateLimit(`consent:${viewer.id}`, { window: 3600, max: 5 });
    }

    await db
      .update(users)
      .set({
        birthYear: input.birthYear,
        birthMonth: input.birthMonth,
        // A child account cannot run classes.
        role: child ? 'student' : input.role,
        consentStatus: child ? 'pending' : 'not_required',
        onboardedAt: new Date(),
        timezone: input.timezone ?? viewer.timezone,
        locale: input.locale ?? viewer.locale,
        updatedAt: new Date(),
      })
      .where(eq(users.id, viewer.id));

    if (child) await sendConsentRequest(viewer.id, viewer.name, input.parentEmail!);
    return c.json({ ok: true, consentRequired: child });
  })

  .post('/consent/resend', async (c) => {
    const viewer = requireSession(c);
    if (viewer.consentStatus !== 'pending') throw conflict('consent_not_pending');
    await enforceRateLimit(`consent:${viewer.id}`, { window: 3600, max: 5 });
    const input = await parseJson(c, z.object({ parentEmail: z.email().max(254).optional() }));
    const [latest] = await db
      .select({ parentEmail: parentalConsents.parentEmail })
      .from(parentalConsents)
      .where(eq(parentalConsents.userId, viewer.id))
      .orderBy(parentalConsents.createdAt)
      .limit(1);
    const parentEmail = input.parentEmail ?? latest?.parentEmail;
    if (!parentEmail) throw badRequest('parent_email_required');
    if (parentEmail.toLowerCase() === viewer.email.toLowerCase()) throw badRequest('parent_email_same');
    await sendConsentRequest(viewer.id, viewer.name, parentEmail);
    return c.json({ ok: true });
  })

  .patch('/', async (c) => {
    const viewer = requireSession(c);
    const input = await parseJson(c, updateSchema);
    if (input.role === 'teacher' && viewer.isChild) {
      throw forbidden('child_restricted', 'Teacher accounts are for adults.');
    }
    if (Object.keys(input).length > 0) {
      await db
        .update(users)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(users.id, viewer.id));
    }
    return c.json({ ok: true });
  });

/** Public endpoints a parent or guardian reaches from the emailed link. */
export const consentRoutes = new Hono<AppEnv>()
  .get('/:token', async (c) => {
    const row = await findConsent(c.req.param('token'));
    return c.json({ childName: row.childName, status: row.status, expired: row.expired });
  })
  .post('/:token', async (c) => {
    const { decision } = await parseJson(c, z.object({ decision: z.enum(['grant', 'decline']) }));
    const row = await findConsent(c.req.param('token'));
    if (row.status !== 'pending') throw conflict('consent_decided', 'This request has already been answered.');
    if (row.expired) throw conflict('consent_expired', 'This link has expired. Ask for a new one from the app.');

    if (decision === 'grant') {
      await db.transaction(async (tx) => {
        await tx
          .update(parentalConsents)
          .set({ status: 'granted', decidedAt: new Date() })
          .where(eq(parentalConsents.id, row.id));
        await tx.update(users).set({ consentStatus: 'granted', updatedAt: new Date() }).where(eq(users.id, row.userId));
      });
      return c.json({ ok: true, status: 'granted' });
    }
    // Declined: remove the account and everything collected for it.
    const { beforeAccountDeletion } = await import('../services/account');
    await beforeAccountDeletion(row.userId);
    await db.delete(users).where(eq(users.id, row.userId));
    return c.json({ ok: true, status: 'declined' });
  });

async function findConsent(token: string) {
  if (!token || token.length > 128) throw notFound();
  const [row] = await db
    .select({
      id: parentalConsents.id,
      userId: parentalConsents.userId,
      status: parentalConsents.status,
      expiresAt: parentalConsents.expiresAt,
      childName: users.name,
    })
    .from(parentalConsents)
    .innerJoin(users, eq(users.id, parentalConsents.userId))
    .where(eq(parentalConsents.tokenHash, sha256(token)))
    .limit(1);
  if (!row) throw notFound();
  return { ...row, expired: row.expiresAt.getTime() < Date.now() };
}
