# Tessera

A study platform: make a set of flashcards in under a minute, then learn it with
active recall. Each card is a tile (a *tessera*), and a set's progress fills in
like a mosaic as you learn it.

> **Status:** all nine planned phases are built and tested. Simplifications,
> things never run against live services, and suggested follow-ups are listed
> in [`docs/STATUS.md`](docs/STATUS.md). To show it to someone, run a
> [preview](docs/DEPLOYMENT.md#preview); to put it online, see
> [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Try it in one command

```bash
docker compose -f compose.preview.yaml up --build
```

Then open http://localhost:4300 and pick a demo account on the login page.
The preview needs no keys: AI and payments run in test mode, and it is kept
out of search engines.

The simplest way to put it online just for yourself is **Render**: one
account, one click, its own database, and Premium for your account
(see [`docs/DEPLOYMENT.md#render`](docs/DEPLOYMENT.md#render)).

To host it on **Netlify**, follow [`docs/DEPLOYMENT.md#netlify`](docs/DEPLOYMENT.md#netlify):
set the base directory to `tessera`, connect a database, and deploy. Pull
requests then get their own preview deploys with demo data.

This app lives in its own `tessera/` directory. The Golf Journal app at the
repository root is separate and untouched.

## Features

- **Accounts:** email and password, optional Google sign-in, email
  verification, password reset, an age gate with parental approval for
  under-13s, password change, data export (JSON) and account deletion.
- **Study sets:** rich text on both sides of a card, bulk paste with
  configurable separators, CSV import and export, print/PDF layouts,
  drag-and-drop and keyboard reordering, stars, private / link-only / public
  sharing, copies, undo for deletions, image and audio attachments (Premium).
- **Six study modes:** Flashcards (flip, swipe, keyboard, shuffle, auto-play),
  Learn (adaptive questions; missed cards come back until answered
  correctly), Test (printable-style mixed test with scoring), Match (timed,
  with a leaderboard), spaced-repetition Review (SM-2 style, four ratings),
  and Listen (text-to-speech in the set's languages).
- **Progress:** four mastery stages per card shown as a mosaic, per-card
  history, streaks, study time, a weekly chart, a daily goal and reminders by
  email or web push. Premium adds a heatmap, review forecast and most-missed
  cards.
- **Library:** dashboard with due cards and recent and starred sets, folders,
  full-text search and browsing public sets by subject.
- **AI (Claude):** make cards from notes, a topic, a PDF or an image, with
  every card reviewed before it is added and labelled as AI-generated;
  suggested definitions, examples and memory tricks; AI-written wrong answers
  for multiple choice; explanations of missed answers. Monthly allowance per
  plan.
- **Classes:** teachers create classes with a join code or invite link,
  assign sets with due dates, and see each student's mastery.
- **Installable and offline:** a web app manifest and service worker; sets
  you have opened can be studied offline, and answers sync when you are back
  online. Premium can download whole sets with their media.
- **Premium:** Stripe Checkout and the Stripe customer portal (test mode
  works out of the box with test keys), with a built-in test provider for
  development.
- Public set pages are rendered on the server with Open Graph tags; sitemap
  and robots.txt. Light and dark themes, keyboard operable, screen-reader
  labelled, reduced-motion aware; English with partial Spanish and Arabic
  (right-to-left) catalogues.

## Requirements

- Node.js 22 or newer
- PostgreSQL 14 or newer with the `pg_trgm` extension (included in the
  standard `postgresql-contrib` package and on managed providers)

## Setup

```bash
cd tessera
npm install
cp .env.example .env
```

Create a database and point `DATABASE_URL` in `.env` at it. For a local
PostgreSQL, the defaults in `.env.example` match this:

```bash
psql -U postgres -c "CREATE ROLE tessera LOGIN PASSWORD 'tessera' CREATEDB" -c "CREATE DATABASE tessera_dev OWNER tessera"
```

Create the tables and load the sample data, then start both servers:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:5173. The seed creates three public sample sets and three
accounts, all with the password `tessera-demo`:

| Email | Role |
| --- | --- |
| `demo@tessera.test` | student, free plan |
| `teacher@tessera.test` | teacher, owns the sample sets |
| `premium@tessera.test` | student, premium plan (can attach images and audio) |

In development, emails (verification, password reset, parental approval) are
not sent: each is written as a JSON file to `.data/outbox/`, with the link
inside.

## Environment variables

All are read by the server (`src/server/env.ts` validates them at startup).
The client needs none: it gets its configuration from `/api/me`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `APP_URL` | yes | Public origin of the app. Dev: `http://localhost:5173`. Used for auth, links in emails and canonical URLs |
| `BETTER_AUTH_SECRET` | in production | Signs sessions. At least 32 characters: `openssl rand -base64 32` |
| `PORT` | no (8787) | Port the server listens on |
| `NODE_ENV` | no | Set to `production` on your host, in the real environment rather than in `.env` |
| `LOG_LEVEL` | no (info) | `fatal` to `trace`, or `silent` |
| `TRUST_PROXY` | no | `1` when behind a reverse proxy that sets `X-Forwarded-For` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in. Redirect URI: `{APP_URL}/api/auth/callback/google` |
| `EMAIL_TRANSPORT` | no | `file` (default without SMTP) or `smtp` |
| `SMTP_URL`, `EMAIL_FROM` | for `smtp` | For example `smtps://user:pass@smtp.example.com:465` |
| `OUTBOX_DIR` | no | Where `file` transport writes emails (`.data/outbox`) |
| `STORAGE_DRIVER` | no (local) | `local` or `s3` for uploaded images and audio |
| `STORAGE_LOCAL_DIR` | no | Directory for `local` storage (`.data/uploads`) |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | for `s3` | Any S3-compatible store (AWS S3, Cloudflare R2, MinIO) |
| `ERROR_WEBHOOK_URL` | no | Unhandled server errors are also POSTed here as JSON |

| `AI_PROVIDER` | no | `anthropic`, `mock` (canned output, for development and tests) or `off`. Defaults to `anthropic` when a key is set |
| `ANTHROPIC_API_KEY` | for `anthropic` | Claude API key |
| `AI_MODEL` | no (`claude-opus-5-5`) | Claude model used for all AI features |
| `PAYMENTS_PROVIDER` | no | `stripe`, `mock` (grants Premium without payment; refused in production) or `off`. Defaults to `stripe` when a key is set |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` | for `stripe` | Secret key (`sk_test_…` for test mode) and the recurring monthly price for Premium |
| `STRIPE_WEBHOOK_SECRET` | for `stripe` | Signing secret of the webhook pointing at `{APP_URL}/api/billing/webhook` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for web push | Generate a pair with `npx web-push generate-vapid-keys`; the subject is a `mailto:` address |
| `RUN_SCHEDULER` | no (1) | Runs reminders and clean-up every few minutes inside the server. Set `0` on hosts with several instances and call the cron endpoint instead |
| `CRON_SECRET` | with `RUN_SCHEDULER=0` | Sent as `x-cron-secret` to `POST /api/internal/cron` by your scheduler |
| `APP_ENV` | no | `development`, `preview` or `production` (the default when `NODE_ENV=production`). Each mode's rules are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#modes) |
| `MIGRATE_ON_START` | no | Apply pending migrations when the server starts. Default on in preview |
| `SEED_DEMO` | no | Load the demo accounts and sample sets at start-up. Default on in preview, refused in production |
| `APP_VERSION` | no | Build identifier reported by `/api/health`; the Docker build sets it from the commit |
| `OWNER_EMAIL` | no | Owner mode: only these addresses (comma-separated) can sign up, and they get Premium and a confirmed email |
| `STORAGE_DRIVER=database` | no | Keeps uploads in PostgreSQL, for hosts without a persistent disk |

### Setting up the optional services

- **Claude:** set `ANTHROPIC_API_KEY`. Without it the AI buttons are hidden;
  `AI_PROVIDER=mock` shows them with canned output.
- **Stripe (test mode):** create a product with a monthly price in the
  Stripe dashboard (test mode), set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`,
  then forward webhooks locally with
  `stripe listen --forward-to localhost:8787/api/billing/webhook` and put the
  printed `whsec_…` secret in `STRIPE_WEBHOOK_SECRET`. Subscribe to
  `checkout.session.completed` and `customer.subscription.*` events in
  production. Pay with card `4242 4242 4242 4242`.
- **Web push:** set the three `VAPID_*` variables; users can then choose push
  reminders in Settings.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :8787 and the web app on :5173, both reloading on change |
| `npm run build` | Production build: client to `dist/client`, server to `dist/server` |
| `npm run preview` | Builds and runs the app in preview mode on :4300 (demo data, test payments) |
| `npm start` | Runs the built server, which serves the API and the web app |
| `npm run typecheck` | TypeScript check of client, server, shared code and tests |
| `npm test` | Unit tests and API tests |
| `npm run test:unit` | Unit tests only (no database needed) |
| `npm run test:api` | API tests against a real database |
| `npm run test:e2e` | End-to-end tests in a browser |
| `npm run db:generate` | Generates a SQL migration from `src/server/db/schema.ts` |
| `npm run db:migrate` | Applies pending migrations |
| `npm run db:seed` | Loads sample accounts and sets (safe to repeat) |
| `npm run check` | Typecheck, translation catalogues, unused code and colour contrast, as CI runs them |
| `npm run check:i18n` | Every translation key is used, and every key used exists |
| `npm run check:unused` | Unused files, exports and dependencies (knip) |
| `npm run check:contrast` | Checks the colour tokens against WCAG AA |
| `node scripts/make-icons.mjs` | Re-renders the app icons and Open Graph image from the logo |

## Running the tests

Unit tests cover the logic shared by client and server: the spaced-repetition
scheduler, the mastery ladder, answer grading, the Learn engine, test scoring,
import parsing and rich-text sanitising. API tests cover every route group,
including authorisation, AI quotas (with the test provider), classes, billing
(with the test provider), data export and account deletion.

```bash
npm run test:unit
```

API tests run the HTTP API against PostgreSQL. They create and drop their own
database, `tessera_vitest`, so the database role needs `CREATEDB`. Set
`TEST_DATABASE_URL` to use a different server.

```bash
npm run test:api
```

End-to-end tests drive a real browser through the core flows on a desktop and
on a 375px-wide phone, including offline study through the service worker, an
axe accessibility audit of every page in light and dark mode, and a
right-to-left (Arabic) layout check. They build the app, start it on port 4173, and reset a
database named `tessera_test` (override with `E2E_DATABASE_URL`). Create that
database once, and install the browser once:

```bash
psql -U postgres -c "CREATE DATABASE tessera_test OWNER tessera"
```

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

## Production

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the checklist, Docker
Compose on a single server, container platforms, and the CI pipeline that
tests every change and publishes an image. In short:

```bash
cp .env.production.example .env.production
```

```bash
docker compose --env-file .env.production up -d --build
```

Or without Docker: `npm ci && npm run build`, then
`NODE_ENV=production node dist/server/db/migrate.js` once per release, and
`NODE_ENV=production node dist/server/main.js` behind HTTPS.

## Layout

```
src/shared/   Logic and types used by both sides (scheduler, grading, Learn engine…)
src/server/   Hono API, Drizzle schema, auth, services, server-rendered pages
src/client/   React app: routes, components, i18n catalogues, offline outbox
drizzle/      Generated SQL migrations
tests/        API tests            e2e/  Browser tests
scripts/      Build, preview, test-server and check scripts
docs/         Architecture, deployment, status and follow-ups
Dockerfile, compose.yaml, compose.preview.yaml   Container image and stacks
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit and
the database diagram.
