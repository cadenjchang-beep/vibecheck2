# ⛳ SwingLog

A coaching app for golf instructors: record a student's swing, tag the fault
against a fixed taxonomy, draw on a frozen frame, assign a drill, and keep the
whole thing as one searchable history per student.

It replaces the usual workaround — clips buried in the camera roll, diagnoses
scattered across text threads, and a spreadsheet nobody updates — with a record
that can answer "what did I tell this student three lessons ago, and is the
fault still there?"

Built with Vite + React + TypeScript. Everything is stored on the device
(offline-first), because the place a lesson gets logged is a driving range with
one bar of signal.

> This repo also still contains the original **Golf Journal** player app, which
> now lives at [`/journal.html`](journal.html). Both build from the same
> project; SwingLog is the root entry.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL. Video capture needs a secure context, so on a phone use
`npm run dev -- --host` over your local network **and** accept that Safari and
Chrome will refuse the camera over plain `http://` on anything but `localhost`
— tunnel it over HTTPS (`npx localtunnel`, ngrok, or similar) to test recording
on a real handset.

## The core loop

1. **Roster → + New lesson.** Pick the student.
2. **Capture.** Record in-app, or pull a clip off the camera roll. The clip is
   written to the device before anything else happens.
3. **Review.** Scrub frame by frame, play at 0.15×/0.25×/0.5×/1×, freeze a frame
   and draw on it — line, angle (with the degrees measured for you), circle, or
   freehand. Each saved frame becomes an annotation pinned to its timestamp.
4. **Diagnose.** Tap a pinned fault or search the 36-entry taxonomy.
5. **Assign.** The drill list is pre-filtered to the faults you just tagged,
   ranked by how many of them each drill addresses.
6. **Save.** It lands on the student's timeline, and recurring faults start
   showing up as "still there" on their profile.

Students open a read-only view of the same timeline with an invite code, and can
tick drills off as they practise them.

## Where things live

| Path | What it is |
| --- | --- |
| `src/swinglog/taxonomy.ts` | The fault taxonomy and starter drill library — the source of truth for both |
| `src/swinglog/store.tsx` | State, persistence, and the single atomic lesson save |
| `src/swinglog/db.ts` | IndexedDB media store — clips are far too big for localStorage |
| `src/swinglog/components/Annotator.tsx` | The drawing surface; points are normalised 0..1 to the frame |
| `src/swinglog/upload.ts` | The clip-backup queue |
| `supabase/swinglog-schema.sql` | Tables, row-level security, and the storage bucket |
| `supabase/swinglog-seed.sql` | The same taxonomy and drills as SQL, keyed by slug |

## Storage model

Two stores, on purpose:

- **Records** (students, lessons, diagnoses, annotations, drill assignments) are
  a single JSON document in `localStorage`. Small, synchronous, easy to export.
- **Clips and poster frames** are blobs in IndexedDB, keyed by video id. A
  two-minute 240fps clip is tens of megabytes; localStorage would blow its quota
  on the first lesson.

A lesson is only committed once the clip is safely on the device, so you never
end up with a video row pointing at bytes that were never written.

Settings has a JSON export/import for the records. Clips are deliberately not
included — they stay in the browser that recorded them until you connect cloud
backup.

## Optional: cloud backup for clips

Without this, clips live on one device and a wiped phone loses them.

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/swinglog-schema.sql`](supabase/swinglog-schema.sql),
   then [`supabase/swinglog-seed.sql`](supabase/swinglog-seed.sql). The first
   creates the tables, the row-level security policies and the `swing-videos`
   bucket; the second loads the shared fault taxonomy and drill library.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key
   from **Project Settings → API**.
4. Rebuild, then connect from **Settings → Cloud backup**.

Clips upload straight from the browser to the storage bucket under
`<coach_id>/<student_id>/<lesson_id>/<video_id>`, so the bytes never pass
through an app server and the first path segment alone decides ownership.
Uploads are queued: a lesson saves instantly whatever the signal is doing, and
the queue drains on the next app open or when the device comes back online.

## Permissions

Enforced in the database, not just the UI:

- A coach has full read/write on their own students, lessons, videos,
  annotations and drill assignments, and cannot see another coach's roster.
- A student can read only the lessons hanging off their own student record. Their
  single write anywhere in the schema is `lesson_drills.completed_at`, enforced
  with a column-level grant, since row-level security cannot restrict *which*
  columns an update touches.
- The fault taxonomy and drill library are shared read-only reference data,
  written by the seed script running as the service role.

These were verified against a real Postgres: coaches cannot see each other's
students, one student cannot see another's lessons or clips (including through
the storage bucket), a student cannot insert a lesson, and an attempt to update
any column of `lesson_drills` other than `completed_at` is refused.

## Plans

The free plan covers 3 students and 10 lessons; the paid plan is $24/month for
unlimited. Card payments are not wired up — the switch in Settings flips the
plan locally so the caps can be exercised.

## Known gaps

- **Push notifications** are not implemented. The student's timeline updates,
  but nothing pings them.
- **Multi-device sync of records** is not implemented; only clip backup is.
  Two devices keep two separate rosters until the backend from
  `swinglog-schema.sql` is actually wired to the app's reads and writes.
- **Side-by-side "then vs now"** playback is not built. A lesson does link to
  earlier lessons that carried the same fault, which is the hook for it.
- **AI fault suggestion** is deliberately out of scope — it needs a corpus of
  tagged videos that only exists after the app has been used for a while.
- `npm run lint` fails: this repo has an ESLint 9 dependency but no
  `eslint.config.js`. That predates SwingLog and is untouched here.
