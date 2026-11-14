import { describe, expect, it } from 'vitest';
import { applyNetlifyDefaults, type NetlifyDeploy } from './netlify';

const deploy = (context: string): NetlifyDeploy => ({
  context,
  url: 'https://tessera.netlify.app',
  deployUrl: 'https://deploy-preview-7--tessera.netlify.app',
  commit: 'abcdef1234567890',
  previewSecret: 'p'.repeat(43),
});

describe('Netlify defaults', () => {
  it('runs production deploys in production mode at the site address', () => {
    const env: Record<string, string | undefined> = { NETLIFY_DATABASE_URL: 'postgres://neon/db' };
    applyNetlifyDefaults(env, deploy('production'));
    expect(env).toMatchObject({
      APP_ENV: 'production',
      NODE_ENV: 'production',
      APP_URL: 'https://tessera.netlify.app',
      DATABASE_URL: 'postgres://neon/db',
      APP_VERSION: 'abcdef123456',
      STORAGE_DRIVER: 'netlify',
      RUN_SCHEDULER: '0',
    });
    // Production never gets a generated secret: it must be configured.
    expect(env.BETTER_AUTH_SECRET).toBeUndefined();
  });

  it('runs deploy previews in preview mode at their own address', () => {
    const env: Record<string, string | undefined> = { PREVIEW_DATABASE_URL: 'postgres://preview/db' };
    applyNetlifyDefaults(env, deploy('deploy-preview'));
    expect(env).toMatchObject({
      APP_ENV: 'preview',
      APP_URL: 'https://deploy-preview-7--tessera.netlify.app',
      BETTER_AUTH_SECRET: 'p'.repeat(43),
      DATABASE_URL: 'postgres://preview/db',
    });
  });

  it('never points a preview at the production database', () => {
    const env: Record<string, string | undefined> = { DATABASE_URL: 'postgres://prod/db', NETLIFY_DATABASE_URL: 'postgres://neon/db' };
    applyNetlifyDefaults(env, deploy('branch-deploy'));
    expect(env.DATABASE_URL).toBe('');
  });

  it('never overrides what was set in the Netlify UI', () => {
    const env: Record<string, string | undefined> = { APP_URL: 'https://tessera.example', STORAGE_DRIVER: 's3', DATABASE_URL: 'postgres://own/db' };
    applyNetlifyDefaults(env, deploy('production'));
    expect(env).toMatchObject({ APP_URL: 'https://tessera.example', STORAGE_DRIVER: 's3', DATABASE_URL: 'postgres://own/db' });
  });
});
