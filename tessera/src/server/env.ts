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
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === 'production';

  if (isProd && (!e.BETTER_AUTH_SECRET || e.BETTER_AUTH_SECRET.length < 32)) {
    throw new Error('BETTER_AUTH_SECRET must be set to at least 32 characters in production.');
  }
  if (e.STORAGE_DRIVER === 's3' && (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY)) {
    throw new Error('STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.');
  }

  const emailTransport = e.EMAIL_TRANSPORT ?? (e.SMTP_URL ? 'smtp' : 'file');
  if (emailTransport === 'smtp' && !e.SMTP_URL) {
    throw new Error('EMAIL_TRANSPORT=smtp needs SMTP_URL.');
  }

  // A mock provider never switches itself on: it has to be asked for.
  const aiProvider = e.AI_PROVIDER || (e.ANTHROPIC_API_KEY ? 'anthropic' : 'off');
  if (aiProvider === 'anthropic' && !e.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY.');
  }
  const paymentsProvider = e.PAYMENTS_PROVIDER || (e.STRIPE_SECRET_KEY ? 'stripe' : 'off');
  if (paymentsProvider === 'stripe' && (!e.STRIPE_SECRET_KEY || !e.STRIPE_PRICE_ID)) {
    throw new Error('PAYMENTS_PROVIDER=stripe needs STRIPE_SECRET_KEY and STRIPE_PRICE_ID.');
  }
  if (isProd && paymentsProvider === 'mock') {
    throw new Error('PAYMENTS_PROVIDER=mock grants premium without payment and is not allowed in production.');
  }

  return {
    ...e,
    isProd,
    isTest: e.NODE_ENV === 'test',
    appUrl: e.APP_URL.replace(/\/+$/, ''),
    authSecret: e.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me-please-32chars',
    emailTransport,
    aiProvider: aiProvider as 'anthropic' | 'mock' | 'off',
    paymentsProvider: paymentsProvider as 'stripe' | 'mock' | 'off',
    googleEnabled: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    pushEnabled: Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY),
  };
}

export const env = load();
export type Env = typeof env;
