-- Golf Journal cloud sync schema.
-- Run this once in your Supabase project's SQL editor.

create table if not exists public.journals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.journals enable row level security;

-- Each user can only see and modify their own journal row.
create policy "Users can read own journal"
  on public.journals for select
  using (auth.uid() = user_id);

create policy "Users can insert own journal"
  on public.journals for insert
  with check (auth.uid() = user_id);

create policy "Users can update own journal"
  on public.journals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own journal"
  on public.journals for delete
  using (auth.uid() = user_id);
