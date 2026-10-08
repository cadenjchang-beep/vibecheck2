-- Golf Journal cloud sync schema.
-- Run this in your Supabase project's SQL editor. It is safe to run again
-- (e.g. after updating the app), so existing projects can re-run the whole file.

create table if not exists public.journals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.journals enable row level security;

-- Each user can only see and modify their own journal row.
drop policy if exists "Users can read own journal" on public.journals;
create policy "Users can read own journal"
  on public.journals for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own journal" on public.journals;
create policy "Users can insert own journal"
  on public.journals for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own journal" on public.journals;
create policy "Users can update own journal"
  on public.journals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own journal" on public.journals;
create policy "Users can delete own journal"
  on public.journals for delete
  using (auth.uid() = user_id);

-- Scorecard photos: one private bucket, one folder per user (<user id>/<photo id>.jpg).
insert into storage.buckets (id, name, public)
values ('scorecards', 'scorecards', false)
on conflict (id) do nothing;

drop policy if exists "Users can read own scorecard photos" on storage.objects;
create policy "Users can read own scorecard photos"
  on storage.objects for select
  using (bucket_id = 'scorecards' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload own scorecard photos" on storage.objects;
create policy "Users can upload own scorecard photos"
  on storage.objects for insert
  with check (bucket_id = 'scorecards' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update own scorecard photos" on storage.objects;
create policy "Users can update own scorecard photos"
  on storage.objects for update
  using (bucket_id = 'scorecards' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'scorecards' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own scorecard photos" on storage.objects;
create policy "Users can delete own scorecard photos"
  on storage.objects for delete
  using (bucket_id = 'scorecards' and (storage.foldername(name))[1] = auth.uid()::text);
