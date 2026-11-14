import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APP_NAME } from '@shared/constants';
import { db } from './db/client';
import { accounts, sessions, users, verifications } from './db/schema';
import { env } from './env';
import { newId } from './ids';
import { log } from './log';
import { resetPasswordEmail, verificationEmail } from './services/email/templates';
import { sendEmail } from './services/email/transport';
import { consumeRateLimit } from './services/rate-limit';
import { beforeAccountDeletion } from './services/account';
import { isAllowedOrigin } from './http/origins';
import { ownerSignUp } from './owner';

const DAY = 60 * 60 * 24;

/** App-owned columns on `users`. None can be set through the auth endpoints. */
const serverOnly = { input: false } as const;

/**
 * The client's address as this server resolved it (app.ts), passed to Better
 * Auth for its rate limits. Always overwritten by the server, never trusted
 * from the request.
 */
export const CLIENT_IP_HEADER = 'x-tessera-client-ip';

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: env.appUrl,
  basePath: '/api/auth',
  secret: env.authSecret,
  trustedOrigins: (request) => {
    const origin = request?.headers.get('origin');
    const hosts = [request?.headers.get('host'), request?.headers.get('x-forwarded-host')];
    return [env.appUrl, origin && isAllowedOrigin(origin, hosts, env) ? origin : null];
  },
  telemetry: { enabled: false },

  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    // People can start studying straight away; publishing and classes ask for
    // a verified address (see requireVerified in http/context.ts).
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(resetPasswordEmail(user, url));
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: DAY,
    sendVerificationEmail: async ({ user, url }) => {
      // Owner accounts are confirmed from the start.
      if (user.emailVerified) return;
      await sendEmail(verificationEmail(user, url));
    },
  },

  socialProviders: env.googleEnabled
    ? { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
    : {},

  databaseHooks: {
    user: {
      create: {
        // Owner mode (OWNER_EMAIL): only the owner may sign up, and starts with Premium.
        before: async (user) => {
          const result = ownerSignUp(user);
          if (!result.allowed) throw new APIError('FORBIDDEN', { code: 'SIGNUPS_CLOSED', message: 'Sign-ups are closed on this site.' });
          return { data: result.data };
        },
      },
    },
  },

  account: {
    // Google verifies addresses, so a Google sign-in may join an existing
    // account that uses the same email.
    accountLinking: { enabled: true, trustedProviders: ['google'] },
  },

  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'student', ...serverOnly },
      plan: { type: 'string', defaultValue: 'free', ...serverOnly },
      planExpiresAt: { type: 'date', required: false, ...serverOnly },
      birthYear: { type: 'number', required: false, ...serverOnly },
      birthMonth: { type: 'number', required: false, ...serverOnly },
      consentStatus: { type: 'string', defaultValue: 'unknown', ...serverOnly },
      onboardedAt: { type: 'date', required: false, ...serverOnly },
      locale: { type: 'string', defaultValue: 'en', ...serverOnly },
      timezone: { type: 'string', defaultValue: 'UTC', ...serverOnly },
      dailyGoal: { type: 'number', defaultValue: 20, ...serverOnly },
      reminderChannel: { type: 'string', defaultValue: 'off', ...serverOnly },
      reminderHour: { type: 'number', defaultValue: 18, ...serverOnly },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await beforeAccountDeletion(user.id);
      },
    },
  },

  session: {
    expiresIn: 30 * DAY,
    updateAge: DAY,
    freshAge: 10 * 60,
  },

  rateLimit: {
    enabled: !env.isTest,
    window: 60,
    max: 120,
    customRules: {
      '/sign-in/email': { window: 60, max: 8 },
      '/sign-up/email': { window: 60 * 10, max: 10 },
      '/request-password-reset': { window: 60 * 10, max: 5 },
      '/send-verification-email': { window: 60 * 10, max: 5 },
    },
    customStorage: {
      consume: (key, rule) => consumeRateLimit(`auth:${key}`, rule),
    },
  },

  advanced: {
    cookiePrefix: 'tessera',
    useSecureCookies: env.appUrl.startsWith('https://'),
    database: { generateId: () => newId() },
    // Resolved in app.ts from the socket, or X-Forwarded-For with TRUST_PROXY.
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },

  logger: {
    disabled: env.isTest,
    level: 'warn',
    log: (level, message, ...args) => log[level]({ source: 'auth', args: args.length ? args : undefined }, message),
  },
});

export type AuthSession = typeof auth.$Infer.Session;
