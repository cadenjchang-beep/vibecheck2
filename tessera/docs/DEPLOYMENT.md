# Deployment

Tessera ships as one container image (or one `node dist/server/main.js`
process) that serves the API, the web app and the server-rendered public
pages. The same build runs in three modes, chosen with `APP_ENV`.

## Modes

| | `development` | `preview` | `production` |
| --- | --- | --- | --- |
| Default when | `NODE_ENV` is not `production` | never: set `APP_ENV=preview` | `NODE_ENV=production` |
| Build | Vite dev server or the build | production build | production build |
| AI | Claude if `ANTHROPIC_API_KEY` is set, else off; `mock` on request | Claude if a key is set, **else the test provider** | Claude if a key is set, else off. `mock` is refused |
| Payments | Stripe if keys are set, else off; `mock` on request | Stripe **test** keys if set, **else the test provider**. Live keys are refused | Stripe if keys are set, else off. `mock` is refused |
| Demo accounts and sample sets (`SEED_DEMO`) | `npm run db:seed` | loaded at start-up | refused |
| Migrations at start-up (`MIGRATE_ON_START`) | off | on | off: run them as a release step |
| `BETTER_AUTH_SECRET` | built-in development value | random per start if unset (everyone is signed out on restart) | required, 32+ characters |
| Search engines | allowed | blocked: `robots.txt` disallows everything, `X-Robots-Tag: noindex`, no sitemap | allowed |
| In the interface | | a "Preview build" banner on every page, and one-click demo sign-in on the login page | |

`GET /api/health` reports the mode and the build version (`APP_VERSION`,
set from the commit by the Docker build), so you can check what is deployed:

```json
{ "ok": true, "mode": "preview", "version": "730e394" }
```

The server also logs warnings at start-up for settings that work but are
risky, such as a production `APP_URL` that is not `https://`.

## Preview

A preview is for showing the app to people: everything works without any
keys, payments cannot be real, and it stays out of search results.

### With Docker (nothing to configure)

```bash
docker compose -f compose.preview.yaml up --build
```

Open http://localhost:4300 and use a demo account from the login page
(password `tessera-demo`): a student, a teacher who owns three sample sets,
and a Premium student. `docker compose -f compose.preview.yaml down` throws
everything away. Optional variables, read from your shell:
`ANTHROPIC_API_KEY` (real AI), `BETTER_AUTH_SECRET` (keep sign-ins across
restarts), `PREVIEW_URL` and `PREVIEW_PORT` (when it is served from elsewhere).

### Without Docker

```bash
npm run preview
```

Builds, then runs the built server in preview mode on port 4300. It uses
`PREVIEW_DATABASE_URL`, falling back to `DATABASE_URL`; a separate database is
best, because the preview migrates it and loads the demo data. Add
`-- --no-build` to reuse the last build.

### On a hosting platform

Deploy the image with `APP_ENV=preview`, `APP_URL` set to the preview's
address and `DATABASE_URL` pointing at a database of its own. A pull-request
preview per branch works the same way: one database per preview.

## Production

### Checklist

1. A PostgreSQL 14+ database with the `pg_trgm` extension available
   (standard on managed providers).
2. HTTPS in front of the app. The service worker, push notifications and
   secure cookies need it.
3. Required settings: `APP_URL` (the public `https://` origin),
   `DATABASE_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), and
   `TRUST_PROXY=1` behind a reverse proxy or load balancer.
4. Email: `SMTP_URL` and `EMAIL_FROM`. Without them, verification and
   password-reset emails are only written to the container's disk.
5. Uploads: the `local` driver needs a persistent volume at `/app/.data`; use
   `STORAGE_DRIVER=s3` with several instances or ephemeral disks.
6. Optional services, each hidden until configured: Google sign-in, Claude,
   Stripe (see the README for the Stripe webhook), web push.
7. Run migrations before starting a new version:
   `node dist/server/db/migrate.js` (the same image, a one-off command).
8. With more than one instance, set `RUN_SCHEDULER=0` and call
   `POST /api/internal/cron` with header `x-cron-secret: $CRON_SECRET` every
   five minutes (reminders and clean-up).
9. Health check: `GET /api/health` (the image has a `HEALTHCHECK` built in).
10. Back up the database. Uploaded files live in the volume or bucket.

`.env.production.example` lists every setting with comments.

### On one server with Docker Compose

```bash
cp .env.production.example .env.production   # fill it in
docker compose --env-file .env.production up -d --build
```

This starts PostgreSQL (with a persistent volume), runs the migrations as a
one-off container, and starts the app on port 8787 once they have succeeded.
Put a reverse proxy with HTTPS in front of it, for example Caddy:

```
tessera.example.com {
  reverse_proxy localhost:8787
}
```

To upgrade, pull the new code and run the same `docker compose` command:
the image is rebuilt, migrations run, then the app restarts.

### On a container platform

Any platform that runs a Docker image works (Fly.io, Render, Railway, Google
Cloud Run, AWS ECS, Azure Container Apps, Kubernetes). Use the image from the
`Dockerfile`, or the one CI publishes (below), and:

- set the environment from `.env.production.example`, with `APP_ENV=production`;
- add a release or pre-deploy command `node dist/server/db/migrate.js`;
- point the platform's health check at `/api/health` on port 8787;
- attach a managed PostgreSQL database, and S3-compatible storage for uploads
  if instances do not share a persistent disk.

## Render (simplest: one account, one click)

`render.yaml` at the repository root describes everything Render needs: the
app (built from `tessera/Dockerfile`) and its own PostgreSQL database, created
together. It runs in **owner mode**: only the email address you give can sign
up, and that account starts with Premium and a confirmed email, so there is
no email service, payment provider or storage service to set up. Uploaded
images and audio are kept in the database (`STORAGE_DRIVER=database`), the
secret key is generated by Render, and migrations run when the app starts.

1. Sign up at render.com with GitHub.
2. **New → Blueprint**, choose this repository, and approve the app and the
   database it lists.
3. When asked for `OWNER_EMAIL`, enter your email address.
4. Wait for the first deploy (a few minutes), open the address Render shows,
   and sign up with that email.

On Render's free plan the app sleeps when unused, so the first visit after a
while takes up to about a minute, and the free database is temporary (Render
deletes free databases after a limited period; check their current terms, or
choose a paid database plan to keep your data). `render.yaml` was written
from Render's documented format but has not been tried on a real Render
account.

Owner mode works on any host: set `OWNER_EMAIL` (several addresses can be
separated with commas). Accounts that already exist for those addresses are
upgraded when the server starts.

## Netlify

Netlify serves the built web app from its CDN and runs the server as
functions (`netlify/functions/`): `api` handles the API, sign-in, public set
pages, `robots.txt` and the sitemap; `jobs` sends reminders and cleans up
every ten minutes. `netlify.toml` holds the build command, routes, security
headers and caching rules.

### Set up

1. In Netlify, **Add new site → Import an existing project**, choose this
   repository, and set the **base directory** to `tessera`. The build command
   and publish directory come from `netlify.toml`.
2. **Database for production.** Either add Netlify DB from the `tessera`
   folder with `npx netlify db init` (it sets `NETLIFY_DATABASE_URL`), or set
   `DATABASE_URL` to any PostgreSQL 14+ database (Neon, Supabase, …). Use the
   provider's *pooled* connection string.
3. **Database for previews.** Set `PREVIEW_DATABASE_URL` to a second, separate
   database. Deploy previews and branch deploys only ever use this one: they
   load demo accounts, accept test payments and run migrations from unmerged
   branches, so they must never touch production data. Without it, preview
   builds stop with a message saying so.
4. **Environment variables** (Site configuration → Environment variables,
   available to *Builds* and *Functions*):
   - `BETTER_AUTH_SECRET`, at least 32 characters (`openssl rand -base64 32`).
     Required for production; previews get one generated per build.
   - `SMTP_URL` and `EMAIL_FROM`, so verification and password-reset emails
     are delivered.
   - `APP_URL` only for a custom domain; otherwise the Netlify address is used.
   - Optional services, each hidden until configured: `ANTHROPIC_API_KEY`;
     `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (webhook
     URL `https://<your site>/api/billing/webhook`); `GOOGLE_CLIENT_ID` and
     `GOOGLE_CLIENT_SECRET` (redirect URI
     `https://<your site>/api/auth/callback/google`); `VAPID_*` for push.
5. **Deploy.** Every build migrates its database first; preview builds also
   load the demo data. Production deploys run in production mode; deploy
   previews and branch deploys run in preview mode, with the banner and demo
   sign-in. Check a deploy at `https://<your site>/api/health`.

### What is different on Netlify

| | Netlify | Docker / Node server |
| --- | --- | --- |
| Uploaded images and audio | Netlify Blobs (built in), or S3 if `S3_BUCKET` is set | local volume or S3 |
| Reminders and clean-up | scheduled function every 10 minutes | in-process timer or the cron endpoint |
| Time per request | 30 seconds | no limit |
| AI card generation | lower effort and a 25-second budget, so it answers in time; very long notes or PDFs may still time out | full effort |
| Upload size | Netlify functions take request bodies of about 6 MB, so audio files close to the 10 MB limit fail | 10 MB audio, 5 MB images |
| Database connections | 3 per function instance (`DATABASE_POOL_MAX`) | 10 |

If AI generation from long documents matters to you, the Docker deployment
has none of these limits. Any setting in the table can be overridden with the
environment variable named in `src/server/platform/netlify.ts`.

### Building it locally

Netlify's CLI runs the same build: from `tessera`, with a scratch database in
`PREVIEW_DATABASE_URL`,

```bash
npx netlify-cli build --offline --context deploy-preview
```

## Continuous integration and the published image

`.github/workflows/tessera.yml` (at the repository root) runs on pull requests
and on pushes to `main` that touch `tessera/`:

| Job | What it checks |
| --- | --- |
| Checks and unit tests | `npm run check` (typecheck, translation catalogues, unused code, colour contrast) and the unit tests |
| API tests | every route against PostgreSQL |
| Browser tests | the Playwright suite on desktop and a 375px phone |
| Container preview smoke test | builds the image, starts `compose.preview.yaml`, and checks it is healthy, in preview mode and kept out of search engines |
| Publish image | on `main` only, after everything passes: pushes `ghcr.io/<owner>/<repo>/tessera:<commit>` and `:latest` to GitHub Container Registry |

Deploying from the published image is a matter of pointing your platform at
it; no deploy target is wired in, because that depends on where it is hosted.
