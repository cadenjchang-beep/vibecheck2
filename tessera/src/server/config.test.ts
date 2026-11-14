import { describe, expect, it } from 'vitest';
import { parseEnv } from './config';

const base = { DATABASE_URL: 'postgres://localhost/tessera', APP_URL: 'https://tessera.example' };
const secret = 'x'.repeat(40);

describe('deployment modes', () => {
  it('defaults to development, with optional services off', () => {
    const env = parseEnv(base);
    expect(env).toMatchObject({ appEnv: 'development', aiProvider: 'off', paymentsProvider: 'off', seedDemo: false, migrateOnStart: false, indexable: true });
  });

  it('treats a production build as production unless told otherwise', () => {
    const env = parseEnv({ ...base, NODE_ENV: 'production', BETTER_AUTH_SECRET: secret });
    expect(env).toMatchObject({ appEnv: 'production', isProd: true, indexable: true, seedDemo: false });
  });

  it('refuses unsafe production settings', () => {
    const prod = { ...base, NODE_ENV: 'production', BETTER_AUTH_SECRET: secret };
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => parseEnv({ ...prod, PAYMENTS_PROVIDER: 'mock' })).toThrow(/not allowed in production/);
    expect(() => parseEnv({ ...prod, AI_PROVIDER: 'mock' })).toThrow(/not allowed in production/);
    expect(() => parseEnv({ ...prod, SEED_DEMO: '1' })).toThrow(/published password/);
    expect(() => parseEnv({ ...base, APP_ENV: 'production' })).toThrow(/NODE_ENV=production/);
  });

  it('warns when production is served without HTTPS', () => {
    const env = parseEnv({ ...base, APP_URL: 'http://tessera.example', NODE_ENV: 'production', BETTER_AUTH_SECRET: secret });
    expect(env.warnings.join(' ')).toMatch(/not https/);
  });

  it('makes a preview fully usable without any keys', () => {
    const env = parseEnv({ ...base, NODE_ENV: 'production', APP_ENV: 'preview' });
    expect(env).toMatchObject({ appEnv: 'preview', aiProvider: 'mock', paymentsProvider: 'mock', seedDemo: true, migrateOnStart: true, indexable: false });
    expect(env.authSecret).toHaveLength(43);
    expect(env.warnings.join(' ')).toMatch(/random one/);
  });

  it('uses real providers in a preview when keys are set, but never live payments', () => {
    const env = parseEnv({ ...base, APP_ENV: 'preview', ANTHROPIC_API_KEY: 'k', STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_PRICE_ID: 'price_1' });
    expect(env).toMatchObject({ aiProvider: 'anthropic', paymentsProvider: 'stripe' });
    expect(() => parseEnv({ ...base, APP_ENV: 'preview', STRIPE_SECRET_KEY: 'sk_live_1', STRIPE_PRICE_ID: 'price_1' })).toThrow(/test keys/);
  });

  it('lets a preview opt out of demo data and start-up migrations', () => {
    const env = parseEnv({ ...base, APP_ENV: 'preview', SEED_DEMO: '0', MIGRATE_ON_START: 'false' });
    expect(env).toMatchObject({ seedDemo: false, migrateOnStart: false });
  });
});
