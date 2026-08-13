-- ============================================================================
-- SwingLog — schema + row level security
-- Run once in the Supabase SQL editor (or hand to Base44 as the locked model).
--
-- This is the Part C §3 schema with three deliberate, documented changes:
--
--  1. coaches.id references auth.users(id) instead of being an independent
--     uuid. Every RLS policy then reduces to `auth.uid() = coach_id`, with no
--     extra join on a `user_id` column. A coach row IS the account.
--  2. fault_tags.slug and drills.slug were added. They are the stable join key
--     between the client's seeded reference data and these rows, so the app
--     never has to hardcode generated uuids. Keep them in sync with
--     src/swinglog/taxonomy.ts.
--  3. lesson_drills gained assigned_at. `completed_at IS NULL` already means
--     "not done", but the timeline needs to order assignments independently of
--     the lesson date (a drill can be re-assigned later).
--
-- Everything else — table names, columns, cascade behaviour — matches the spec.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table if not exists public.coaches (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  name text not null,
  subscription_status text not null default 'free'
    check (subscription_status in ('free', 'active', 'canceled')),
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  -- null until the student accepts an app invite and creates a login
  linked_user_id uuid references auth.users (id) on delete set null,
  name text not null,
  email text,
  -- single-use-ish code the student types (or follows via link) to claim the row
  invite_code text unique not null default encode(gen_random_bytes(4), 'hex'),
  created_at timestamptz not null default now()
);

create index if not exists students_coach_id_idx on public.students (coach_id);
create index if not exists students_linked_user_id_idx on public.students (linked_user_id);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  note text,
  lesson_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists lessons_student_id_date_idx
  on public.lessons (student_id, lesson_date desc);
create index if not exists lessons_coach_id_idx on public.lessons (coach_id);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  storage_url text not null,
  angle text check (angle in ('down_the_line', 'face_on', 'other')),
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

create index if not exists videos_lesson_id_idx on public.videos (lesson_id);

-- ---------------------------------------------------------------------------
-- Shared reference data: fault taxonomy + drill library
-- ---------------------------------------------------------------------------

create table if not exists public.fault_tags (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,          -- e.g. 'Over the Top'
  category text not null,      -- e.g. 'Swing Plane', 'Contact', 'Path & Face'
  description text
);

create table if not exists public.drills (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  instructional_video_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.drill_fault_tags (
  drill_id uuid not null references public.drills (id) on delete cascade,
  fault_tag_id uuid not null references public.fault_tags (id) on delete cascade,
  primary key (drill_id, fault_tag_id)
);

-- ---------------------------------------------------------------------------
-- Join tables + annotations
-- ---------------------------------------------------------------------------

create table if not exists public.lesson_fault_tags (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  fault_tag_id uuid not null references public.fault_tags (id) on delete cascade,
  primary key (lesson_id, fault_tag_id)
);

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  timestamp_seconds numeric not null,
  -- { "shapes": [ { "kind": "angle", "points": [{x,y}, ...], "color": "#..." } ] }
  -- Points are normalised 0..1 against the video frame so a drawing made on a
  -- phone renders identically on a laptop.
  drawing_data jsonb not null,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists annotations_video_id_idx on public.annotations (video_id);

create table if not exists public.lesson_drills (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  drill_id uuid not null references public.drills (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,    -- null until the student marks it done
  primary key (lesson_id, drill_id)
);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Two roles, enforced by ownership rather than by a role column:
--   * you are a coach for a row if the owning coach_id is your auth.uid()
--   * you are a student for a row if it hangs off a students row whose
--     linked_user_id is your auth.uid()
-- ---------------------------------------------------------------------------

alter table public.coaches           enable row level security;
alter table public.students          enable row level security;
alter table public.lessons           enable row level security;
alter table public.videos            enable row level security;
alter table public.fault_tags        enable row level security;
alter table public.drills            enable row level security;
alter table public.drill_fault_tags  enable row level security;
alter table public.lesson_fault_tags enable row level security;
alter table public.annotations       enable row level security;
alter table public.lesson_drills     enable row level security;

-- Is the current user the student this row belongs to?
create or replace function public.is_my_student_row(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and s.linked_user_id = auth.uid()
  );
$$;

-- Does the current user own (coach) the lesson?
create or replace function public.coaches_lesson(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lessons l
    where l.id = p_lesson_id and l.coach_id = auth.uid()
  );
$$;

-- Can the current user read the lesson (coach who owns it, or its student)?
create or replace function public.can_read_lesson(p_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lessons l
    join public.students s on s.id = l.student_id
    where l.id = p_lesson_id
      and (l.coach_id = auth.uid() or s.linked_user_id = auth.uid())
  );
$$;

-- coaches ------------------------------------------------------------------
drop policy if exists "coach reads own row" on public.coaches;
create policy "coach reads own row" on public.coaches
  for select using (
    id = auth.uid()
    -- a student may read their coach's name, nothing more granular is needed
    or exists (
      select 1 from public.students s
      where s.coach_id = coaches.id and s.linked_user_id = auth.uid()
    )
  );

drop policy if exists "coach creates own row" on public.coaches;
create policy "coach creates own row" on public.coaches
  for insert with check (id = auth.uid());

drop policy if exists "coach updates own row" on public.coaches;
create policy "coach updates own row" on public.coaches
  for update using (id = auth.uid()) with check (id = auth.uid());

-- students -----------------------------------------------------------------
drop policy if exists "coach manages own students" on public.students;
create policy "coach manages own students" on public.students
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists "student reads own record" on public.students;
create policy "student reads own record" on public.students
  for select using (linked_user_id = auth.uid());

-- lessons ------------------------------------------------------------------
drop policy if exists "coach manages own lessons" on public.lessons;
create policy "coach manages own lessons" on public.lessons
  for all using (coach_id = auth.uid()) with check (coach_id = auth.uid());

drop policy if exists "student reads own lessons" on public.lessons;
create policy "student reads own lessons" on public.lessons
  for select using (public.is_my_student_row(student_id));

-- videos -------------------------------------------------------------------
drop policy if exists "coach manages lesson videos" on public.videos;
create policy "coach manages lesson videos" on public.videos
  for all using (public.coaches_lesson(lesson_id))
  with check (public.coaches_lesson(lesson_id));

drop policy if exists "student reads lesson videos" on public.videos;
create policy "student reads lesson videos" on public.videos
  for select using (public.can_read_lesson(lesson_id));

-- annotations --------------------------------------------------------------
drop policy if exists "coach manages annotations" on public.annotations;
create policy "coach manages annotations" on public.annotations
  for all using (
    exists (select 1 from public.videos v
            where v.id = annotations.video_id and public.coaches_lesson(v.lesson_id))
  )
  with check (
    exists (select 1 from public.videos v
            where v.id = annotations.video_id and public.coaches_lesson(v.lesson_id))
  );

drop policy if exists "student reads annotations" on public.annotations;
create policy "student reads annotations" on public.annotations
  for select using (
    exists (select 1 from public.videos v
            where v.id = annotations.video_id and public.can_read_lesson(v.lesson_id))
  );

-- lesson_fault_tags --------------------------------------------------------
drop policy if exists "coach manages lesson fault tags" on public.lesson_fault_tags;
create policy "coach manages lesson fault tags" on public.lesson_fault_tags
  for all using (public.coaches_lesson(lesson_id))
  with check (public.coaches_lesson(lesson_id));

drop policy if exists "student reads lesson fault tags" on public.lesson_fault_tags;
create policy "student reads lesson fault tags" on public.lesson_fault_tags
  for select using (public.can_read_lesson(lesson_id));

-- lesson_drills ------------------------------------------------------------
drop policy if exists "coach manages lesson drills" on public.lesson_drills;
create policy "coach manages lesson drills" on public.lesson_drills
  for all using (public.coaches_lesson(lesson_id))
  with check (public.coaches_lesson(lesson_id));

drop policy if exists "student reads lesson drills" on public.lesson_drills;
create policy "student reads lesson drills" on public.lesson_drills
  for select using (public.can_read_lesson(lesson_id));

-- The student's ONLY write anywhere in the app: ticking a drill off.
-- RLS cannot restrict which columns an update touches, so that is enforced by
-- the column-level grant below; this policy only decides which rows they see.
drop policy if exists "student completes own drills" on public.lesson_drills;
create policy "student completes own drills" on public.lesson_drills
  for update using (public.can_read_lesson(lesson_id))
  with check (public.can_read_lesson(lesson_id));

-- reference data: readable by everyone signed in, seeded by service role only
drop policy if exists "anyone reads fault tags" on public.fault_tags;
create policy "anyone reads fault tags" on public.fault_tags
  for select to authenticated using (true);

drop policy if exists "anyone reads drills" on public.drills;
create policy "anyone reads drills" on public.drills
  for select to authenticated using (true);

drop policy if exists "anyone reads drill fault tags" on public.drill_fault_tags;
create policy "anyone reads drill fault tags" on public.drill_fault_tags
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Column-level privileges
--
-- Students are authenticated users like coaches, so without this a student
-- could PATCH lesson_drills.drill_id. Narrow the table grant to the one column
-- they are allowed to write; the RLS policy above still gates which rows.
-- ---------------------------------------------------------------------------

revoke update on public.lesson_drills from authenticated;
grant update (completed_at) on public.lesson_drills to authenticated;

-- Reference tables are read-only for end users; seeding runs as service_role.
revoke insert, update, delete on public.fault_tags       from authenticated;
revoke insert, update, delete on public.drills           from authenticated;
revoke insert, update, delete on public.drill_fault_tags from authenticated;

-- ---------------------------------------------------------------------------
-- Video storage
--
-- Objects are keyed  <coach_id>/<student_id>/<lesson_id>/<video_id>.<ext>
-- so the first path segment alone decides coach ownership, and the second lets
-- a student read their own clips without a table lookup.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('swing-videos', 'swing-videos', false)
on conflict (id) do nothing;

drop policy if exists "coach writes own swing videos" on storage.objects;
create policy "coach writes own swing videos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'swing-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "coach reads own swing videos" on storage.objects;
create policy "coach reads own swing videos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'swing-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "coach deletes own swing videos" on storage.objects;
create policy "coach deletes own swing videos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'swing-videos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "student reads own swing videos" on storage.objects;
create policy "student reads own swing videos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'swing-videos'
    and public.is_my_student_row(((storage.foldername(name))[2])::uuid)
  );
