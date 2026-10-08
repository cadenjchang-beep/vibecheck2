# ⛳ Golf Journal

A personal golf journal for serious golfers: log every round from a photo of
its scorecard, keep a library of all your cards, and track practice sessions,
tournaments, trends, records, an estimated handicap index, goals, and club
distances.

Built with Vite + React + TypeScript. Data is stored locally in the browser
(offline-first) and can optionally sync across devices through Supabase.

## Run locally

```bash
npm install
npm run dev
```

The app is fully usable without any backend — everything is kept in
localStorage, and the More tab has JSON export/import for manual backups.

## Logging rounds from scorecard photos

On the **Rounds** tab, tap **Take photo** after a round (it opens the camera on
a phone) or **Upload photos** to pick a whole stack of old cards at once.

- Each photo is resized, stored on the device and attached to the round it
  becomes. The date comes from the card or, failing that, from when the photo
  was taken.
- With automatic reading turned on, Claude (Anthropic's AI) reads the card —
  course, tees, rating/slope, par and every player's hole scores and putts —
  and fills in the round for you to check. Holes it found hard to read are
  highlighted, and when several players are on one card you pick whose row is
  yours (it pre-selects the name you set under **More → Scorecard reading**).
- When you upload several photos they are queued and read in the background,
  so the next card is usually ready as soon as you save the current one.
- The **Cards** tab is the scorecard library: every photographed card with its
  score, tap one to view it full size (tap again to zoom) next to the logged
  scorecard.

Without automatic reading the photos are still saved with your rounds; you
type the scores in next to the photo.

### Turning on automatic reading

1. Create an API key in the [Claude Console](https://platform.claude.com/).
2. In the app, open **More → Scorecard reading**, paste the key and save. Add
   the name or initials you write on your cards so your row is picked
   automatically.

The key is stored only in that browser (it is not synced or included in
backups) and is sent only to the Anthropic API, directly from the browser.
Reading a card typically costs a few cents. Add the key on each device you
scan from.

## Enable cloud sync (optional)

Sync lets you sign in with an email + password on any device and have your
journal — scorecard photos included — follow you.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL editor**, run the contents of
   [`supabase/schema.sql`](supabase/schema.sql) (creates the `journals`
   table and the private `scorecards` photo bucket, with row-level security so
   each user can only access their own data). The script is safe to re-run:
   if you set sync up before scorecard photos existed, run it again to add the
   photo bucket.
3. In **Project Settings → API**, copy the project URL and anon public key.
4. Copy `.env.example` to `.env.local` and fill both values in. For a hosted
   deployment (Vercel, Netlify, …), set the same two variables in the host's
   environment settings instead.
5. Rebuild/redeploy. A **Cloud sync** panel appears in the More tab where you
   can create an account and sign in.

Notes:

- By default Supabase requires new accounts to confirm their email address.
  You can turn that off under **Authentication → Providers → Email** if you
  only sync your own devices.
- Sync is offline-first: edits are saved locally first and pushed a couple of
  seconds later. Opening the app pulls the latest copy. If two devices were
  edited while offline, their entries are merged (newest edit of an item wins).

## How syncing works

The whole journal is mirrored as one JSON document per user in the
`journals` table. On sign-in or app open the app pulls the cloud copy; local
changes mark the journal dirty and are pushed with a short debounce. When
both the cloud copy and the local copy changed since the last sync, the lists
are union-merged by entry id with the newer `updatedAt` winning.

Scorecard photos are too big for the journal document, so they live in the
browser's IndexedDB and the journal only stores their ids. When signed in,
each photo is uploaded to the `scorecards` storage bucket as
`<user id>/<photo id>.jpg` after the journal is pushed, and a device that is
missing a photo downloads it the first time it is shown. JSON backups from the
More tab include the photos unless you untick **Include scorecard photos**.
