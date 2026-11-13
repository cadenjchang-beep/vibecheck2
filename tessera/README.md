# Tessera

A study platform: make a set of flashcards in under a minute, then learn it with
active recall. Each card is a tile (a *tessera*), and a set's progress fills in
like a mosaic as you learn it.

> **Status:** the foundation, set creation and the Flashcards and Learn modes
> are built and tested. Several planned areas are not built yet.
> [`docs/STATUS.md`](docs/STATUS.md) lists exactly what works, what is
> server-only, and what remains.

This app lives in its own `tessera/` directory. The Golf Journal app at the
repository root is separate and untouched.

## What works today

- Accounts: email and password, optional Google sign-in, email verification,
  password reset, an age gate with parental approval for under-13s.
- Study sets: rich text on both sides of a card, bulk paste with configurable
  separators, CSV import and export, print/PDF layouts, drag-and-drop and
  keyboard reordering, stars, private / link-only / public sharing, copies,
  undo for deletions, image and audio attachments (premium accounts).
- Flashcards: flip, swipe, keyboard, shuffle, either side first, auto-play,
  "know it / still learning" sorting.
- Learn: adaptive multiple choice, true/false and typed answers; missed cards
  come back until answered correctly; four mastery stages per card.
- Progress: a mastery stage per card and a mastery percentage per set, shown
  as a mosaic. Answers are recorded on the device first and synced in the
  background. Study time, streaks and per-card history are recorded too, but
  have no screen yet.
- Public set pages rendered on the server with Open Graph tags; sitemap.

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

Reserved for parts that are not built yet, and read but unused today:
`AI_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_MODEL`, `PAYMENTS_PROVIDER`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RUN_SCHEDULER`,
`CRON_SECRET`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :8787 and the web app on :5173, both reloading on change |
| `npm run build` | Production build: client to `dist/client`, server to `dist/server` |
| `npm start` | Runs the built server, which serves the API and the web app |
| `npm run typecheck` | TypeScript check of client, server, shared code and tests |
| `npm test` | Unit tests and API tests |
| `npm run test:unit` | Unit tests only (no database needed) |
| `npm run test:api` | API tests against a real database |
| `npm run test:e2e` | End-to-end tests in a browser |
| `npm run db:generate` | Generates a SQL migration from `src/server/db/schema.ts` |
| `npm run db:migrate` | Applies pending migrations |
| `npm run db:seed` | Loads sample accounts and sets (safe to repeat) |
| `npm run check:contrast` | Checks the colour tokens against WCAG AA |

## Running the tests

Unit tests cover the logic shared by client and server: the spaced-repetition
scheduler, the mastery ladder, answer grading, the Learn engine, test scoring,
import parsing and rich-text sanitising.

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
on a 375px-wide phone. They build the app, start it on port 4173, and reset a
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

```bash
npm ci && npm run build
```

```bash
NODE_ENV=production node dist/server/db/migrate.js
```

```bash
NODE_ENV=production node dist/server/main.js
```

One Node process serves the API, the built web app and the server-rendered
public set pages on `PORT`. Put it behind HTTPS (a reverse proxy or your
platform's router), set `APP_URL` to the public `https://` origin, set
`BETTER_AUTH_SECRET`, configure SMTP, and use S3-compatible storage if the
host's disk is not persistent. `node_modules` must be present at runtime.

## Layout

```
src/shared/   Logic and types used by both sides (scheduler, grading, Learn engine…)
src/server/   Hono API, Drizzle schema, auth, services, server-rendered pages
src/client/   React app: routes, components, i18n catalogues, offline outbox
drizzle/      Generated SQL migrations
tests/        API tests            e2e/  Browser tests
docs/         Architecture, schema diagram, status and follow-ups
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit and
the database diagram.
