# Status and follow-ups

All nine build phases from the brief are complete. Each phase was checked with
unit, API and browser tests before the next one started, and the full suites
were run again at the end (see the last section).

## What was built, and how it was checked

| Phase | What | How it was verified |
| --- | --- | --- |
| 1 | Project setup, full database schema and migration, email/password and Google auth, verification, password reset, age gate with parental approval, request logging, error reporting, CSRF origin guard, rate limiting, design tokens | API and browser tests; contrast script |
| 2 | Set editor with rich text, bulk paste and file import with separators, CSV export, print/PDF layouts, drag-and-drop and keyboard reordering, card and set stars, visibility, copies, undo for deletions, draft recovery, media uploads, set page, server-rendered public pages, sitemap | API and browser tests |
| 3 | Flashcards and Learn, study events with offline outbox and idempotent sync, mastery stages, study time, streaks | Unit, API and browser tests, including a 375px phone |
| 4 | Test, Match (with leaderboard), spaced-repetition Review, Listen | Unit tests for test generation and the scheduler, API and browser tests |
| 5 | Dashboard, folders, search and browse, stats with weekly chart and premium analytics, daily goal, email and push reminders, scheduler and cron endpoint | API and browser tests; charts reviewed on screen |
| 6 | AI: cards from notes, topic, PDF or image; suggestions; wrong answers for multiple choice; explanations; monthly allowance | API and browser tests with the test provider; the real request shape checked against a local stub of the Claude API |
| 7 | Classes, join codes and invite links, assignments with due dates, teacher progress table, student view | API tests (including access revocation) and a two-browser teacher/student test |
| 8 | Manifest, icons, service worker (offline study, push), premium offline downloads, accessibility audit, right-to-left check, Spanish and Arabic catalogues for the app shell | Browser tests: offline study, axe audit of 22 pages in light and dark, 375px sweep of 27 pages in LTR and RTL |
| 9 | Stripe checkout, portal and webhooks; test provider; upgrade page; plan, password, data export and account deletion in Settings; promotion slot for the free plan; Dockerfile; documentation | API and browser tests with the test provider |

### After the nine phases

| What | How it was verified |
| --- | --- |
| Clean-up: dead code and an unused component removed, feature flags from the phased build removed, 66 unused translation strings removed, a circular import untangled. `npm run check` (typecheck, translations, unused code via knip, contrast) keeps it that way | The checks themselves, plus the full test suites |
| Deployment modes (`APP_ENV`): preview (demo data, test providers, banner and demo sign-in, kept out of search engines, live payment keys refused) and production (test providers, demo data and a missing secret refused) | Unit tests of the rules in `config.test.ts`; both compose stacks built and run in Docker |
| Docker image, `compose.preview.yaml`, `compose.yaml` with a one-off migration step, `.env.production.example`, `docs/DEPLOYMENT.md` | Image built; preview stack started healthy with demo data and sign-in; production stack migrated, started healthy in production mode, and wrote to its data volume as the unprivileged user |
| Fix found while deploying: Better Auth could not see client addresses and fell back to one shared rate-limit bucket, so failed logins from one person could throttle everyone | The warning is gone; auth API tests pass |
| CI workflow (checks, API, browser, container smoke test) and image publishing to GitHub Container Registry on `main` | Validated as YAML and against the same commands run here; it has not run on GitHub yet |
| Netlify: CDN for the web app, functions for the API and scheduled jobs, Netlify Blobs for uploads, migrations (and preview demo data) at build time, previews isolated on their own database | Netlify's CLI built it offline as a deploy preview; the built function bundles were then called directly: sign-in, sessions, server-rendered set pages, uploads with byte ranges to Netlify's local Blobs server, cross-site blocking, scheduled jobs. Not yet deployed to a real Netlify site |
| Devices: a two-column study layout for phones held sideways (Flashcards, Learn), finger-sized controls on touch screens only, notch-safe side insets, a wider column on large monitors, and compressed JavaScript and CSS from the Node server (337 KB to 89 KB for the main script) | A device audit of 17 pages on 10 screen shapes (320px phone to 2560px monitor, touch and mouse), screenshots of each shape, and `e2e/devices.spec.ts` as a regression test |

## Acceptance criteria

| Criterion | Status |
| --- | --- |
| A new user can sign up, paste 20 terms and start studying in under 2 minutes | Met. `core-flow.spec.ts` does it end to end on desktop and on a phone, in a few seconds of scripted time |
| Wrong answers in Learn reappear until answered correctly | Met. Unit tests over 40 randomised sessions, plus a browser test |
| The spaced-repetition queue schedules cards correctly after each rating | Met. Scheduler unit tests, API tests of the queue after each rating, and a browser test of the Review screen |
| A private set is inaccessible to other users by URL | Met. API and browser tests cover the page, the API, the raw HTML, attached media, and access through a class ending when the student leaves or the class is archived |
| Usable at 375px and fully keyboard operable | Met for every page: a 375px overflow sweep (left-to-right and right-to-left), an axe audit with no violations, and keyboard tests for the editor and every study mode |

## Not exercised against a live service

No credentials were available where this was built, so these paths are
implemented but have never run against the real service:

- **Claude API.** The request was checked against a local stub (model,
  structured output schema, fallback header) and the SDK types; real output
  quality has not been evaluated. Before launch, run each AI feature against
  real notes, PDFs and photos and tune the prompts.
- **Stripe.** Checkout, portal and webhook handling are written against the
  current SDK types but untested with real test-mode keys. Run through the
  Stripe test-mode steps in the README before launch.
- **Google sign-in, SMTP delivery, S3 storage and web push delivery.** Tests
  use the file outbox and local disk; push subscription and the service
  worker's push handler are written but no push has been delivered.
- **The CI workflow** has not run on GitHub yet: it runs on the first pull
  request or push to `main` that touches `tessera/`.

## Simplifications and decisions worth knowing

- **Authorisation is enforced in the API** (`services/policies.ts`), not with
  PostgreSQL row-level security.
- **PDF export is the browser's "Save as PDF"** from a print layout.
- **Email verification does not block studying.** It is required to publish a
  set, use AI features and create classes.
- **The AI allowance resets on the 1st of each month in UTC**, not in the
  user's time zone. Cancelling a generation in the browser does not stop the
  server request, which still counts once it completes.
- **AI-written wrong answers are created on request** (a set page action), not
  automatically, to keep costs predictable. Learn and Test use them whenever
  they exist.
- **Classes have one teacher.** There are no co-teachers, sections or
  gradebook export. Progress is mastery-based; there is no due-date
  enforcement or late marking.
- **Offline:** sets opened recently work offline for everyone; Premium
  "downloads" additionally keep a set and its media pinned. Audio range
  requests are not served from the cache, so long audio may not seek offline.
  Lazily loaded pages are precached, but the fonts are cached only once used.
- **Translations are partial.** Spanish and Arabic cover the app shell,
  navigation and home; every other string falls back to English. In Arabic,
  English fallback sentences can show punctuation on the wrong side.
- **The free plan's "ad slot" is a Premium promotion.** No ad network is
  integrated, by design (the footer promises no third-party ads).
- **Parental approval is "email plus"**: a link sent to an address the child
  supplies. This needs legal review before launching to under-13s, and so do
  the Privacy and Terms pages, which are plain-language placeholders.
- **Sign-up reveals whether an email is registered**, as most consumer apps do.
- **Match times are reported by the browser** and only sanity-checked.
- **Load time.** On an emulated mid-range phone (4x slower CPU, slow 4G,
  empty cache) the first meaningful paint is 0.7 s for a public set page and
  1.8 to 1.9 s for the landing and login pages, inside the 2-second target.
  Not yet measured on a physical device. Repeat visits load from the service
  worker's cache.
- **The name "Tessera" is a working title** with no trademark check.

## Suggested follow-ups

1. Run the live-service checks above with test credentials (Claude, Stripe,
   SMTP, Google, S3, push), and build and run the Docker image.
2. Build a small evaluation set for the AI features (real notes, PDFs, photos,
   vocabulary lists) and tune prompts, effort and card counts against it.
3. Finish the Spanish and Arabic catalogues, and have native speakers review
   them.
4. Measure load time on a real mid-range phone over a throttled connection.
5. Legal review of parental consent, privacy policy and terms; decide data
   retention for deleted sets (currently purged by the scheduler after 30
   days) and for logs.
6. Product: co-teachers and class sections, assignment due-date reminders,
   sharing sets with specific people, image occlusion cards, a mobile app
   shell.

## Last full run

`npm run check` clean (typecheck, translations, unused code, contrast); 220
unit and API tests and 80 browser tests (desktop and 375px phone projects,
including the device matrix), all passing; the Docker image builds, both
compose stacks start healthy, and the Netlify build and function bundles were
checked as described above.
