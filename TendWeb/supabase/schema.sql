-- Tend household sync schema.
-- Run this once in your Supabase project's SQL editor.
--
-- The shape mirrors what CKShare gives the iOS build: a household is a shared
-- unit, several people can be in it, and the database — not the client —
-- decides who may read it.

create table if not exists public.households (
  id uuid primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx
  on public.household_members (user_id);

alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- Membership check as a SECURITY DEFINER function.
--
-- Doing this inline in the households policy would recurse: reading
-- household_members would itself trigger a policy that reads households. The
-- function runs with the definer's rights and sidesteps that entirely.
create or replace function public.is_household_member(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target and user_id = auth.uid()
  );
$$;

-- Households: readable and writable only by members.
drop policy if exists "Members can read their households" on public.households;
create policy "Members can read their households"
  on public.households for select
  using (public.is_household_member(id));

drop policy if exists "Members can update their households" on public.households;
create policy "Members can update their households"
  on public.households for update
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

-- Any signed-in user may create a household row; they add themselves to
-- household_members in the same flow, which is what makes it theirs.
drop policy if exists "Signed-in users can create households" on public.households;
create policy "Signed-in users can create households"
  on public.households for insert
  with check (auth.uid() is not null);

-- Membership: you can see who's in a household you're in, add yourself
-- (that's how joining by invite code works), and remove yourself (leaving).
drop policy if exists "Members can see the roster" on public.household_members;
create policy "Members can see the roster"
  on public.household_members for select
  using (public.is_household_member(household_id));

drop policy if exists "Users can join a household" on public.household_members;
create policy "Users can join a household"
  on public.household_members for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can leave a household" on public.household_members;
create policy "Users can leave a household"
  on public.household_members for delete
  using (auth.uid() = user_id);
