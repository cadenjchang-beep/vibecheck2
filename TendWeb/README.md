# Tend — web

*The app that carries what you're carrying in your head.*

A household app built around **mental load** rather than around a shared
calendar. Calendars are a solved problem; the unsolved one is the invisible
tracking work that falls disproportionately on one person. Three things follow,
and they shape every decision here:

1. **Capture has to be near-zero-friction.** A thought that takes ten seconds to
   log doesn't get logged. Hence the one-line quick add with a live parse, and a
   list field that keeps focus after every entry.
2. **Imbalance should be visible without being a scoreboard.** Load View shows
   the shape of the week in household order, with no rank and no verdict.
3. **Re-entry is a top contributor.** Hence the PWA share target: share a flyer
   or a message into Tend and it arrives as a filled-in draft.
4. **The household should be able to see everything at once, not just today.**
   Calendar's **List** view (`Agenda.tsx`) is Cozi's "list view" done Tend's
   way — every event, grouped by day, searchable and filterable by who it's
   for, reaching a year ahead. Day/Week/Month answer "what's on"; Agenda
   answers "what's coming".

This is a port of the native iOS build in [`../Tend`](../Tend). The logic — the
recurrence engine, the natural-language parser, aisle categorisation, Pulse and
Load View — is the same design, translated. See [Differences from
iOS](#differences-from-the-ios-build).

---

## Run it

```bash
cd TendWeb
npm install
npm run dev
```

That's the whole setup. Tend runs entirely in the browser, offline-first, with
no account and no backend. Every feature works except sharing a household with
another person.

```bash
npm test                         # 93 unit tests — recurrence, parser, categoriser, Pulse, Load, Agenda
npm run build                    # typecheck + production bundle
npm run smoke                    # critical-path browser pass (needs `npm i -D playwright`)
node scripts/smoke-agenda.mjs    # Agenda-specific browser pass — search, filters, empty states
```

## Turn on sharing (optional)

Sharing needs somewhere for a household to live that isn't one browser. The
setup mirrors the sibling web app in this repo:

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). It
   creates `households` and `household_members` with row-level security, so the
   database — not the client — decides who can read a household.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
4. Restart. A **Sharing** panel appears in Settings: create an account, press
   *Start sharing*, and send the invite code to whoever else is in the household.

The invite code *is* the household id, which is worth saying plainly: anyone
holding it can join. It's the web equivalent of a share link — send it to a
person, don't post it.

---

## How it's built

```
src/
├── lib/
│   ├── recurrence.ts    RRULE subset, expansion, and the edit-scope surgery
│   ├── eventStore.ts    Applies a recurrence mutation to the events array
│   ├── agenda.ts        Agenda's filtering, day-grouping and date labelling
│   ├── quickAdd.ts      Natural-language parser
│   ├── aisles.ts        Curated keyword map for grocery categorisation
│   ├── pulse.ts         The recap generator
│   ├── load.ts          Load View computation, and its design rules
│   ├── store.ts         List/task/meal operations — the one place flags flip
│   └── dates.ts         Local-time helpers and all date formatting
├── components/
│   ├── EventRow.tsx     The one row that renders an event — shared by
│   │                    Day/Week/Month and Agenda so a meeting looks the
│   │                    same wherever it's found
│   ├── Agenda.tsx       The List view — see §4 above
│   └── …                One file per screen otherwise
├── types.ts             The data model
├── storage.ts           localStorage, migrations, export/import
├── sync.ts              Supabase household sync and the merge
└── useHouseholdSync.ts  Offline-first pull/push
```

Plain React state and hand-written CSS, matching the conventions of the existing
app in this repo. No state library, no CSS framework, no component kit.

### Four decisions worth knowing about

**Recurrence runs on pure values.** `recurrence.ts` takes a snapshot and returns
a `SeriesMutation` describing every write an edit implies; `eventStore.ts`
applies it in one pass. The three-way "this event / this and future / all
events" split is the easiest place in a calendar app to quietly destroy
someone's data, so it's unit-tested against COUNT splitting, exception-date
shifting, and detached copies moving across a series split.

**Flags flip in exactly one place each.** `setItemChecked` and
`setTaskComplete` are the only functions that touch `isChecked` / `isComplete`,
so `completedBy` and `completedAt` can never be forgotten. Those two fields are
what Load View runs on — a check-off that skips them is invisible work all over
again.

**Load View's rules live in the data layer.** `summarizeLoad` returns shares in
household order and refuses to sort by volume; there's no rank, target, streak
or week-over-week delta anywhere; observations are descriptive ("Most of the
list check-offs came from Sam this time"), never prescriptive; and the caveat —
*"This is only what Tend can see. Plenty of the work at home doesn't get logged
anywhere."* — is part of the claim the chart makes, not a dismissible
disclaimer. The tests assert the copy contains no comparative language.

**Agenda's member filter is OR, not AND.** Selecting Sam and Alex shows events
for *either* of them, not only events both attend — with most events having one
or two attendees, an AND filter would mostly return nothing. `matchesFilter` in
`agenda.ts` is the one place this is decided, and it's the first thing the test
file for it asserts.

---

## Design system

Colour, type and motion are tokens in `index.css`, extended (not replaced) from
the app's original sage-and-paper palette:

- **Colour** stays quiet on purpose — per-member colour is the app's real
  visual language, so the neutral palette never competes with it. One semantic
  addition: `--warn`, a separate amber tone from `--danger`, used only for
  overdue tasks. Overdue is a fact worth noticing, not a red-alert failure to
  feel bad about — the same "visibility, not judgment" instinct Load View runs
  on, applied to a single dot and a line of text.
- **Type** is Inter throughout, plus one restrained addition: `--font-display`
  (Literata, a variable serif) on exactly two moments — the onboarding hero and
  Pulse's daily headline. Everything operational — screen titles, buttons,
  data, every input — stays in Inter, where legibility at small sizes matters
  more than character.
- **Motion** runs on one shared easing, `--ease-out`, so a sheet opening, a
  Load View bar settling and a screen fading in all move with the same hand
  rather than a different curve per component. Every transition and animation
  respects `prefers-reduced-motion`.

One thing tried and deliberately reverted: date-group headers in Agenda were
originally `position: sticky`, pinned under the topbar while scrolling — until
testing turned up a genuine Chromium rendering bug (confirmed by hand-computing
the correct sticky offset and finding the browser's own number didn't match it,
reproducibly, regardless of z-index, compositing hints, or flex-gap changes) that
clipped a header's text against the topbar at certain scroll depths in long
lists. Rather than ship an intermittent visual bug chasing a "nice to have",
Agenda's headers are plain, non-sticky labels — the same pattern Lists' aisle
headers and Tasks' due-date groups already use successfully.

---

## Differences from the iOS build

| | iOS | Web |
| --- | --- | --- |
| Storage | SwiftData | localStorage |
| Sync | CloudKit, automatic | Supabase, explicit |
| Sharing | CKShare across Apple IDs | Invite code + row-level security |
| Conflicts | One CloudKit record per item | Union merge by id, newer edit wins |
| Share sheet | Share Extension | PWA share target |
| Offline | Free, from CloudKit | Service worker + localStorage |

**Not ported**, because the platform has no equivalent worth faking: Home Screen
widgets, Live Activities, Siri, the Watch app, Face ID locking, and
location-based reminders. The recipe importer is a manual form here rather than
a URL/photo import — JSON-LD scraping needs a server to get around CORS, and
VisionKit has no web counterpart.

---

## What's verified

Unlike the iOS build, this one actually runs:

- **93 unit tests** pass — recurrence expansion and all three edit scopes, the
  parser, aisle categorisation, Pulse generation, Load computation, Agenda's
  filtering and day-grouping.
- **Typechecks clean** under `strict` with `noUnusedLocals`.
- **Builds** to ~91 KB gzipped (JS + CSS).
- **Two browser smoke suites**, both against real Chromium:
  - `npm run smoke` — the critical path: onboarding → quick-add a recurring
    event → confirm the scope prompt appears → add list items and confirm the
    field keeps focus → check one off → confirm Load View reflects it in
    household order → reload and confirm persistence.
  - `node scripts/smoke-agenda.mjs` — Agenda specifically: every seeded event
    shows up grouped by day → search narrows the list and clears back →
    the member filter hides the right person's events → a search with no
    matches shows its own empty state → opening a row reaches the real event
    editor → the past-events toggle works.
- **Both themes eyeballed**, light and dark, including the display typeface and
  the overdue-task treatment.

Not verified: multi-device sync against a real Supabase project. That needs
credentials this environment doesn't have.
