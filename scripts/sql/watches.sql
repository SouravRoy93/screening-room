-- ─────────────────────────────────────────────────────────────────────────────
-- Table Watch (roadmap #8) — the things a member has asked to be told about.
-- Apply in Supabase → SQL Editor (or via the Supabase MCP apply_migration).
-- Migration name suggestion: watches_table_watch
--
-- One row per watched thing. Three kinds today:
--   'table' — a restaurant, watched for its reservation release  (ref = dining id)
--   'place' — a place, watched for a good-weather window         (ref = place id)
--   'show'  — a series, watched for the next episode             (ref = tmdb id)
--
-- `ref` is text rather than bigint so live Google results and TMDB ids can
-- share the column with curated numeric ids — the same compromise
-- tracked_items.tmdb_id makes.
--
-- `last_fired_at` + `last_fired_key` are what stop a moment nagging: the
-- engine writes back the key of the moment it showed (e.g. '2026-08-14:release')
-- and won't raise the same one twice. Clearing them re-arms the watch.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.watches (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  kind            text        not null check (kind in ('table', 'place', 'show')),
  ref             text        not null,
  -- Denormalised so a watch list renders without touching three catalogs.
  title           text        not null,
  subtitle        text,
  -- Member-set intent, all optional: "for our anniversary", a target date,
  -- a party size. Kept as columns rather than json because the engine reads them.
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

-- The hub asks "what's live for me right now?" on every load; keep it cheap.
create index if not exists watches_user_active_idx
  on public.watches (user_id, active)
  where active;

alter table public.watches enable row level security;

-- Owner-only, exactly as tracked_items. No service-role path is needed yet;
-- when the Sunday Edit starts including moments, it will bypass RLS with the
-- service-role key the same way the sender does.
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

-- ── Keep updated_at honest ──────────────────────────────────────────────────
create or replace function public.touch_watches()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists watches_touch on public.watches;
create trigger watches_touch
  before update on public.watches
  for each row execute function public.touch_watches();

-- ── Account deletion ────────────────────────────────────────────────────────
-- delete_my_account() already exists; watches cascade via the user_id FK, so
-- nothing to add. Verify after applying:
--   select tablename, policyname from pg_policies where tablename = 'watches';
