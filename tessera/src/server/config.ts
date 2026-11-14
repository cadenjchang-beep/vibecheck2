import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const flag = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true');

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  APP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BETTER_AUTH_SECRET: optional,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: flag,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  EMAIL_TRANSPORT: z.enum(['file', 'smtp']).optional(),
  SMTP_URL: optional,
  EMAIL_FROM: z.string().default('Tessera <no-reply@localhost>'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.data/uploads'),
  S3_BUCKET: optional,
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_FORCE_PATH_STYLE: flag,

  AI_PROVIDER: z.enum(['anthropic', 'mock', 'off', '']).optional(),
  ANTHROPIC_API_KEY: optional,
  AI_MODEL: optional,

  PAYMENTS_PROVIDER: z.enum(['stripe', 'mock', 'off', '']).optional(),
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_ID: optional,

  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: z.string().default('mailto:admin@localhost'),

  RUN_SCHEDULER: z
    .string()
    .optional()
    .transform((v) => v !== '0' && v !== 'false'),
  CRON_SECRET: optional,
  ERROR_WEBHOOK_URL: optional,
  OUTBOX_DIR: z.string().default('.data/outbox'),

  /** Deployment mode; see docs/DEPLOYMENT.md. Defaults from NODE_ENV. */
  APP_ENV: z.enum(['development', 'preview', 'production', '']).optional(),
  /** Apply pending migrations when the server starts (default: on in preview). */
  MIGRATE_ON_START: optional,
  /** Load the demo accounts and sample sets when the server starts (default: on in preview; refused in production). */
  SEED_DEMO: optional,
  /** Build identifier reported by /api/health, such as a commit hash. */
  APP_VERSION: optional,
});

export type AppEnvironment = 'development' | 'preview' | 'production';

const on = (value: string | undefined, fallback: boolean) => (value === undefined ? fallback : value === '1' || value === 'true');

/**
 * Reads and checks the configuration. Pure: the caller passes the variables,
 * so the rules for each deployment mode can be tested.
 *
 * - development: local work; anything goes.
 * - preview: a production build for review. Test providers are allowed (and
 *   used when no real keys are set), demo data is loaded, search engines are
 *   kept out, and live payment keys are refused.
 * - production: test providers, demo data and missing secrets are refused.
 */
export function parseEnv(source: Record<string, string | undefined>) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';
  const appEnv: AppEnvironment = e.APP_ENV || (isProd ? 'production' : 'development');
  const preview = appEnv === 'preview';
  const production = appEnv === 'production';
  const warnings: string[] = [];

  if (production && !isProd) throw new Error('APP_ENV=production needs NODE_ENV=production.');

  let authSecret = e.BETTER_AUTH_SECRET;
  if (!authSecret || authSecret.length < 32) {
    if (production) throw new Error('BETTER_AUTH_SECRET must be set to at least 32 characters in production.');
    if (preview && isProd) {
      // A throwaway preview still works without one; sign-ins last until the next restart.
      authSecret = randomBytes(32).toString('base64url');
      warnings.push('BETTER_AUTH_SECRET is not set: using a random one, so everyone is signed out when the preview restarts.');
    } else {
      authSecret = 'dev-only-secret-change-me-please-32chars';
    }
  }
  if (production && !e.APP_URL.startsWith('https://')) {
    warnings.push('APP_URL is not https: secure cookies, the service worker and push notifications need HTTPS.');
  }
  if (e.STORAGE_DRIVER === 's3' && (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY)) {
    throw new Error('STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.');
  }

  const emailTransport = e.EMAIL_TRANSPORT ?? (e.SMTP_URL ? 'smtp' : 'file');
  if (emailTransport === 'smtp' && !e.SMTP_URL) {
    throw new Error('EMAIL_TRANSPORT=smtp needs SMTP_URL.');
  }

  // A mock provider never switches itself on, except in a preview, where it
  // stands in for a missing key so every feature can be tried.
  const aiProvider = e.AI_PROVIDER || (e.ANTHROPIC_API_KEY ? 'anthropic' : preview ? 'mock' : 'off');
  if (aiProvider === 'anthropic' && !e.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY.');
  }
  const paymentsProvider = e.PAYMENTS_PROVIDER || (e.STRIPE_SECRET_KEY ? 'stripe' : preview ? 'mock' : 'off');
  if (paymentsProvider === 'stripe' && (!e.STRIPE_SECRET_KEY || !e.STRIPE_PRICE_ID)) {
    throw new Error('PAYMENTS_PROVIDER=stripe needs STRIPE_SECRET_KEY and STRIPE_PRICE_ID.');
  }
  if (production && paymentsProvider === 'mock') {
    throw new Error('PAYMENTS_PROVIDER=mock grants premium without payment and is not allowed in production.');
  }
  if (production && aiProvider === 'mock') {
    throw new Error('AI_PROVIDER=mock returns sample text instead of real answers and is not allowed in production.');
  }
  if (preview && e.STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
    throw new Error('A preview must not take real payments: use Stripe test keys (sk_test_...).');
  }

  const seedDemo = on(e.SEED_DEMO, preview);
  if (production && seedDemo) {
    throw new Error('SEED_DEMO creates accounts with a published password and is not allowed in production.');
  }

  return {
    ...e,
    isProd,
    isTest: e.NODE_ENV === 'test',
    appEnv,
    /** Search engines are kept out of previews. */
    indexable: !preview,
    migrateOnStart: on(e.MIGRATE_ON_START, preview),
    seedDemo,
    version: e.APP_VERSION ?? 'dev',
    warnings,
    appUrl: e.APP_URL.replace(/\/+$/, ''),
    authSecret,
    emailTransport,
    aiProvider: aiProvider as 'anthropic' | 'mock' | 'off',
    paymentsProvider: paymentsProvider as 'stripe' | 'mock' | 'off',
    googleEnabled: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    pushEnabled: Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY),
  };
}
