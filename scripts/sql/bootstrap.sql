-- ─────────────────────────────────────────────────────────────────────────────
-- Screening Room — full database bootstrap.
--
-- Everything the app expects, in one script, safe to run on an empty project.
-- Written when the original Supabase project became unreachable and the schema
-- had to be reconstructed from the code that uses it. Reconstructed from:
--   tracked_items      hooks/use-tracked.ts, lib/cloud-saves.ts, use-tonight,
--                      use-followups, use-nearby-dining, use-evening
--   profiles           pages/social.tsx
--   get_public_profile pages/public-profile.tsx
--   delete_my_account  pages/hub.tsx
--   watches            hooks/use-watch.ts (roadmap #8)
--
-- Apply in Supabase → SQL Editor. Idempotent: re-running is harmless.
-- Migration name suggestion: screening_room_bootstrap
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. tracked_items — the spine. Every vertical writes here.
-- ═════════════════════════════════════════════════════════════════════════════
-- Column types follow lib/db/src/schema/tracked-items.ts, whose header calls
-- itself a source-of-truth mirror of the live table — so `rating` is NUMERIC
-- and `title` is NULLABLE, both per the mirror.
--
-- ONE DELIBERATE DIVERGENCE: tmdb_id is TEXT here, where the old table used
-- BIGINT. That bigint is why lib/cloud-saves.ts keeps Google live results
-- local-only — their string place ids don't fit, so those saves never reached
-- the cloud. With no data to migrate, this rebuild is the moment to fix it.
-- (An older memory note in the backup also claimed "text"; it was wrong about
-- the old table, but it describes the right destination.)
--
-- `status` also carries 'booked': dining saves reuse this table via
-- lib/cloud-saves.ts. Left unconstrained, as it was, so no existing write path
-- can be rejected by a constraint that didn't exist before.

create table if not exists public.tracked_items (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  vertical     text        not null default 'entertainment',
  tmdb_id      text        not null,
  media_type   text        not null,
  title        text,
  year         integer,
  genres       text[],
  poster_path  text,
  status       text,
  rating       numeric,
  answers      jsonb,
  rated_at     timestamptz,
  meta         jsonb,
  updated_at   timestamptz not null default now()
);

-- The upsert conflict target every write in the app relies on:
--   onConflict: "user_id,tmdb_id,media_type"
create unique index if not exists tracked_items_user_item
  on public.tracked_items (user_id, tmdb_id, media_type);

create index if not exists tracked_items_user_vertical_idx
  on public.tracked_items (user_id, vertical);
create index if not exists tracked_items_user_updated_idx
  on public.tracked_items (user_id, updated_at desc);

alter table public.tracked_items enable row level security;

drop policy if exists "own items: select" on public.tracked_items;
create policy "own items: select" on public.tracked_items
  for select using (auth.uid() = user_id);

drop policy if exists "own items: insert" on public.tracked_items;
create policy "own items: insert" on public.tracked_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "own items: update" on public.tracked_items;
create policy "own items: update" on public.tracked_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own items: delete" on public.tracked_items;
create policy "own items: delete" on public.tracked_items
  for delete using (auth.uid() = user_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. profiles — opt-in public sharing (the /u/:id pages).
-- ═════════════════════════════════════════════════════════════════════════════
-- user_id is the primary key because social.tsx upserts without specifying a
-- conflict target, which requires the PK to be the natural key.

create table if not exists public.profiles (
  user_id        uuid        primary key references auth.users(id) on delete cascade,
  display_name   text,
  share_enabled  boolean     not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Owner-only. Public reads go through get_public_profile(), never the table:
-- that keeps the share check server-side and returns only aggregate data.
drop policy if exists "own profile: select" on public.profiles;
create policy "own profile: select" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "own profile: insert" on public.profiles;
create policy "own profile: insert" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: update" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own profile: delete" on public.profiles;
create policy "own profile: delete" on public.profiles
  for delete using (auth.uid() = user_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. watches — Table Watch and smart moments (roadmap #8).
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.watches (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  kind            text        not null check (kind in ('table', 'place', 'show')),
  ref             text        not null,
  title           text        not null,
  subtitle        text,
  note            text,
  target_date     date,
  party_size      smallint,
  active          boolean     not null default true,
  last_fired_at   timestamptz,
  last_fired_key  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint watches_unique_per_user unique (user_id, kind, ref)
);

create index if not exists watches_user_active_idx
  on public.watches (user_id, active)
  where active;

alter table public.watches enable row level security;

drop policy if exists "own watches: select" on public.watches;
create policy "own watches: select" on public.watches
  for select using (auth.uid() = user_id);

drop policy if exists "own watches: insert" on public.watches;
create policy "own watches: insert" on public.watches
  for insert with check (auth.uid() = user_id);

drop policy if exists "own watches: update" on public.watches;
create policy "own watches: update" on public.watches
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own watches: delete" on public.watches;
create policy "own watches: delete" on public.watches
  for delete using (auth.uid() = user_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. email_prefs — The Sunday Edit (roadmap #6).
-- ═════════════════════════════════════════════════════════════════════════════
-- Written long before this bootstrap and never applied, because the original
-- project became unreachable first. Included here so #6 has its schema waiting
-- whenever the sender is finished. Nothing reads this table yet.
--
-- Still to build on the app side: the Social opt-in toggle. Without it nothing
-- ever inserts a row, and the sender has no recipients.

create table if not exists public.email_prefs (
  user_id            uuid        primary key references auth.users(id) on delete cascade,
  email              text        not null,
  first_name         text,
  weekly_edit        boolean     not null default true,
  unsubscribe_token  uuid        not null default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists email_prefs_unsubscribe_token_idx
  on public.email_prefs (unsubscribe_token);

alter table public.email_prefs enable row level security;

-- Owner-only. The weekly sender uses the service-role key, which bypasses RLS.
drop policy if exists "own prefs: select" on public.email_prefs;
create policy "own prefs: select" on public.email_prefs
  for select using (auth.uid() = user_id);

drop policy if exists "own prefs: insert" on public.email_prefs;
create policy "own prefs: insert" on public.email_prefs
  for insert with check (auth.uid() = user_id);

drop policy if exists "own prefs: update" on public.email_prefs;
create policy "own prefs: update" on public.email_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own prefs: delete" on public.email_prefs;
create policy "own prefs: delete" on public.email_prefs
  for delete using (auth.uid() = user_id);

-- Unsubscribe has to work for someone who is NOT signed in — they clicked a
-- link in an email. Security definer, takes only the token, returns a boolean.
-- It can only ever switch the flag off, and reads nothing back.
create or replace function public.unsubscribe_weekly(token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit integer;
begin
  update public.email_prefs
     set weekly_edit = false,
         updated_at  = now()
   where unsubscribe_token = token
     and weekly_edit = true;
  get diagnostics hit = row_count;
  -- true when we just switched someone off, and also when they already were
  return hit > 0 or exists (
    select 1 from public.email_prefs where unsubscribe_token = token
  );
end;
$$;

revoke all on function public.unsubscribe_weekly(uuid) from public;
grant execute on function public.unsubscribe_weekly(uuid) to anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. get_public_profile — the only public read in the system.
-- ═════════════════════════════════════════════════════════════════════════════
-- Callable by anon (that's the point: /u/:id is shown to non-members), but it
-- returns nothing unless the member switched sharing on, and it only ever
-- returns counts plus a short recent list — never the full library.

create or replace function public.get_public_profile(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prof   public.profiles%rowtype;
  result jsonb;
begin
  select * into prof from public.profiles
   where user_id = p_user and share_enabled = true;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'display_name', prof.display_name,
    'watched_count', (
      select count(*) from public.tracked_items
       where user_id = p_user and vertical = 'films' and status = 'watched'
    ),
    'want_count', (
      select count(*) from public.tracked_items
       where user_id = p_user and vertical = 'films' and status = 'want'
    ),
    'recent', coalesce((
      select jsonb_agg(r)
        from (
          select title, poster_path, media_type, rating
            from public.tracked_items
           where user_id = p_user and vertical = 'films' and status = 'watched'
           order by coalesce(rated_at, updated_at) desc
           limit 6
        ) r
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. delete_my_account — immediate and irreversible, as the privacy page says.
-- ═════════════════════════════════════════════════════════════════════════════
-- Every table above cascades from auth.users, so removing the user removes
-- everything. Takes no arguments and reads auth.uid() directly, so it can only
-- ever delete the caller.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. updated_at triggers
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- tracked_items writes updated_at explicitly on every upsert, so it gets no
-- trigger — one would silently override the value the client just sent.



drop trigger if exists email_prefs_touch on public.email_prefs;
create trigger email_prefs_touch
  before update on public.email_prefs
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists watches_touch on public.watches;
create trigger watches_touch
  before update on public.watches
  for each row execute function public.touch_updated_at();


-- ═════════════════════════════════════════════════════════════════════════════
-- Verify
-- ═════════════════════════════════════════════════════════════════════════════
-- Expect four tables, each with rowsecurity = true and four policies, and
-- four functions (get_public_profile, delete_my_account, unsubscribe_weekly,
-- touch_updated_at):
--
--   select tablename, rowsecurity from pg_tables
--    where schemaname = 'public' order by tablename;
--
--   select tablename, count(*) as policies from pg_policies
--    where schemaname = 'public' group by tablename order by tablename;
--
--   select routine_name from information_schema.routines
--    where routine_schema = 'public' order by routine_name;
