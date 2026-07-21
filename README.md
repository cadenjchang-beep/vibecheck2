# ⛳ Golf Journal

A personal golf journal for serious golfers: log rounds (with hole-by-hole
scorecards), practice sessions, and tournaments; track trends, records, an
estimated handicap index, goals, and club distances.

Built with Vite + React + TypeScript. Data is stored locally in the browser
(offline-first) and can optionally sync across devices through Supabase.

## Run locally

```bash
npm install
npm run dev
```

The app is fully usable without any backend — everything is kept in
localStorage, and the More tab has JSON export/import for manual backups.

## Enable cloud sync (optional)

Sync lets you sign in with an email + password on any device and have your
journal follow you.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's **SQL editor**, run the contents of
   [`supabase/schema.sql`](supabase/schema.sql) (creates the `journals`
   table with row-level security so each user can only access their own data).
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
