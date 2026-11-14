/**
 * What a Netlify deploy implies about configuration. Netlify only passes the
 * variables set in its UI to functions at run time, so facts about the deploy
 * (its context, address and commit) are recorded at build time in
 * netlify/generated/deploy.json and applied here before the server reads its
 * settings. Anything set explicitly in the Netlify UI wins.
 */
export interface NetlifyDeploy {
  /** production, deploy-preview, branch-deploy or dev. */
  context: string;
  /** The site's main address. */
  url: string;
  /** This deploy's own address (deploy previews and branch deploys). */
  deployUrl: string;
  commit: string;
  /** Generated per build for previews without a configured secret. */
  previewSecret: string;
}

export function applyNetlifyDefaults(env: Record<string, string | undefined>, deploy: NetlifyDeploy): void {
  const set = (key: string, value: string | undefined) => {
    if (value && !env[key]) env[key] = value;
  };
  const production = deploy.context === 'production';
  const preview = deploy.context === 'deploy-preview' || deploy.context === 'branch-deploy';

  if (preview) {
    // Previews load demo accounts with a published password, take test
    // payments and run migrations from unmerged branches: never against the
    // production database. They only ever use their own.
    env.DATABASE_URL = env.PREVIEW_DATABASE_URL ?? '';
  } else {
    set('DATABASE_URL', env.NETLIFY_DATABASE_URL);
  }
  set('APP_ENV', production ? 'production' : preview ? 'preview' : 'development');
  set('NODE_ENV', production || preview ? 'production' : 'development');
  set('APP_URL', production ? deploy.url : deploy.deployUrl || deploy.url);
  set('APP_VERSION', deploy.commit.slice(0, 12));
  if (preview) set('BETTER_AUTH_SECRET', deploy.previewSecret);

  // Serverless: files go to Netlify Blobs, the disk is read-only apart from
  // /tmp, the scheduled function runs the jobs, and the build has already
  // migrated (and, for previews, seeded) the database.
  set('STORAGE_DRIVER', env.S3_BUCKET ? 's3' : 'netlify');
  set('OUTBOX_DIR', '/tmp/tessera-outbox');
  env.RUN_SCHEDULER = '0';
  set('MIGRATE_ON_START', '0');
  set('SEED_DEMO', '0');
  set('DATABASE_POOL_MAX', '3');
  // Netlify ends a request after 30 seconds: leave room to answer.
  set('AI_TIMEOUT_SECONDS', '25');
  set('AI_GENERATE_EFFORT', 'low');
}
