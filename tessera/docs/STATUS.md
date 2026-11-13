# Status and follow-ups

The brief had nine build phases. Phases 1 to 3 are complete and tested. Phase 4
is built on the server and in the shared logic but has no screens yet. Phases 5
to 9 are not built. Work stopped at that point at the owner's request, with the
app left in a consistent state: nothing in the interface links to a screen that
does not exist.

Last full run: 133 unit tests, 48 API tests, 40 browser tests, all passing; the
production build starts and serves the app.

## Built and verified

| Phase | What | How it was verified |
| --- | --- | --- |
| 1 | Project setup, full database schema and migration, email/password auth, verification, password reset, age gate with parental approval, request logging, error reporting, CSRF origin guard, rate limiting, design tokens | API and browser tests; contrast script |
| 2 | Set editor with rich text, bulk paste and file import with separators, CSV export, print/PDF layouts, drag-and-drop and keyboard reordering, card and set stars, visibility, copies, undo for deletions, draft recovery, media uploads, set page, server-rendered public pages, sitemap | API and browser tests |
| 3 | Flashcards and Learn modes, study events with offline outbox and idempotent sync, mastery stages, study time, streaks | Unit, API and browser tests, including a 375px phone |

## Built on the server only (no screen yet)

These are implemented and covered by unit or API tests, but nothing in the
interface uses them, so they are hidden behind `src/client/lib/built.ts`:

- **Spaced repetition.** The SM-2-style scheduler, `GET /api/review/queue`,
  `GET /api/review/summary`, and rating events through `/api/study/sync`.
  Cards studied in Flashcards or Learn are already being scheduled.
- **Test mode.** Test generation (true/false, multiple choice, matching,
  written) and scoring in `src/shared/test.ts`.
- **Match.** Score recording and the leaderboard endpoint.
- English strings for all four remaining modes are already in
  `src/client/locales/en/`.

## Not built

| Phase | Missing |
| --- | --- |
| 4 | Screens for Test, Match, Review and Listen |
| 5 | Dashboard with due and starred sets, folders (tables exist), search and browse (indexes exist, no endpoint), stats and weekly chart, daily goal, reminders by email or web push |
| 6 | All AI features: generation from notes, topic, PDF or image; suggestions; distractors; explanations; quota |
| 7 | Classes, join codes, assignments, class progress (tables and the access rule exist) |
| 8 | Service worker and manifest (so the app is not installable and does not open offline), dark-mode review, accessibility audit, right-to-left check, Spanish and Arabic catalogues (the files are empty stubs) |
| 9 | Payments, upgrade screen, settings and profile, account deletion and data export screens, Dockerfile |

## Acceptance criteria

| Criterion | Status |
| --- | --- |
| A new user can sign up, paste 20 terms and start studying in under 2 minutes | Met. Browser test `core-flow.spec.ts` does it end to end on desktop and phone |
| Wrong answers in Learn reappear until answered correctly | Met. Unit tests over 40 randomised sessions, plus a browser test |
| The spaced-repetition queue schedules cards correctly after each rating | Met at the scheduler and API level (`srs.test.ts`, `review.test.ts`). There is no review screen yet |
| A private set is inaccessible to other users by URL | Met. API and browser tests cover the page, the API, the raw HTML and attached media |
| Usable at 375px and operable by keyboard | Met for what is built: the core flow runs at 375px with an overflow check, and the editor, Flashcards and Learn have keyboard tests. No full accessibility audit has been done |

## Not exercised against a live service

No credentials were available where this was built, so these paths are
implemented but have never run against the real thing:

- Google sign-in (configuration only; the button appears when keys are set).
- SMTP delivery. Tests use the file outbox.
- S3-compatible storage. Tests use the local disk driver.

## Simplifications and decisions worth knowing

- **Authorisation is enforced in the API**, in `services/policies.ts`, not with
  PostgreSQL row-level security.
- **PDF export is the browser's "Save as PDF"** from a print layout, not a
  server-generated file. This renders every script and direction correctly.
- **Email verification does not block studying.** It is required before
  publishing a set publicly.
- **Premium has no purchase path.** Image and audio uploads are gated by
  `shared/entitlements.ts`; the only premium account is the seeded one.
- **Account deletion is configured in the auth layer** (with a hook that
  removes uploaded files) but has no screen and no test. Data export does not
  exist.
- **Parental approval is "email plus"**: a link sent to an address the child
  supplies. That needs legal review before a real launch with under-13s.
- **Sign-up reveals whether an email is registered**, as most consumer apps do.
- **Match times are reported by the browser** and only sanity-checked.
- **The Privacy and Terms pages are plain-language placeholders** and say so.
- **Soft-deleted sets are never purged** and unused uploads are never cleaned
  up: the functions exist (`purgeOrphanedMedia`) but the scheduler that would
  run them is part of phase 5.
- **Initial JavaScript is about 150 kB gzipped.** The 2-second load target on
  a mid-range phone has not been measured.
- **The name "Tessera" is a working title** with no trademark check.

## Picking this up again

1. Build a phase's screens, then flip its flags in `src/client/lib/built.ts`.
   Navigation, the mode picker and the landing page follow automatically.
2. Suggested order: Review and Test screens (the logic is done), then the
   dashboard and search, then offline support, then the rest.
3. Keep `npm test` and `npm run test:e2e` green; add a browser test per flow.
