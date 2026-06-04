-- Agent on Camera (AOC) · waitlist capture.
-- Email-only waitlist for the AOC launch (doors open July 1, 2026, 8:00 PM ET).
-- The /aoc page POSTs here via /api/aoc/waitlist; the Supabase row is the durable
-- record. Kit (ConvertKit) sync is best-effort and tracked by kit_synced.
--
-- Idempotent. Apply via scripts/apply-aoc-waitlist-migration.mjs
-- (uses pg with SUPABASE_DB_URL).

create table if not exists public.aoc_waitlist (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  email         text not null unique,
  source        text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  kit_subscriber_id  bigint,
  kit_synced    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists aoc_waitlist_created_at_idx
  on public.aoc_waitlist (created_at desc);

create index if not exists aoc_waitlist_kit_synced_idx
  on public.aoc_waitlist (kit_synced);

-- No public policies. The API route uses the service role key and bypasses RLS.
alter table public.aoc_waitlist enable row level security;
