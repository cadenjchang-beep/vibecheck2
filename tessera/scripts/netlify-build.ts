// Netlify's build command (see netlify.toml): builds the app, records what
// this deploy is for the functions, then migrates the database and, for
// deploy previews, loads the demo data. Run with tsx.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { applyNetlifyDefaults, type NetlifyDeploy } from '../src/server/platform/netlify';

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'build']);

const deploy: NetlifyDeploy & { indexHtml: string } = {
  context: process.env.CONTEXT ?? 'dev',
  url: process.env.URL ?? '',
  deployUrl: process.env.DEPLOY_PRIME_URL ?? '',
  commit: process.env.COMMIT_REF ?? 'local',
  previewSecret: randomBytes(32).toString('base64url'),
  indexHtml: readFileSync('dist/client/index.html', 'utf8'),
};
mkdirSync('netlify/generated', { recursive: true });
writeFileSync('netlify/generated/deploy.json', JSON.stringify(deploy));

const env: Record<string, string | undefined> = { ...process.env };
applyNetlifyDefaults(env, deploy);
if (!env.DATABASE_URL) {
  console.error(
    env.APP_ENV === 'preview'
      ? '\nDeploy previews need a database of their own: set PREVIEW_DATABASE_URL in the site settings (never the production database), then deploy again.\n'
      : '\nNo database is configured. Add Netlify DB (`npx netlify db init`, which sets NETLIFY_DATABASE_URL) or set DATABASE_URL in the site settings, then deploy again.\n',
  );
  process.exit(1);
}
run('node', ['dist/server/db/migrate.js'], env);
if (env.APP_ENV === 'preview' && process.env.SEED_DEMO !== '0') run('node', ['dist/server/db/seed.js'], env);
console.log(`Netlify build ready: ${env.APP_ENV} at ${env.APP_URL}`);
