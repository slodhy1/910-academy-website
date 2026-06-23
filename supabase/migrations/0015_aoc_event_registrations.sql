-- AOC free live event (/three-levels) · registration capture.
-- Free Zoom webinar (July 1, 2026, 8:00 PM ET). The /three-levels page POSTs here via
-- /api/aoc-event/register; the Supabase row is the durable record. Kit sync is best-effort,
-- drained by the cron (/api/aoc-event/reconcile) and tracked by kit_synced. A separate Kit tag
-- (KIT_TAG_ID_AOC_FREE_EVENT) keeps the event reminder sequence independent of the waitlist.
--
-- Idempotent. Apply via the Supabase CLI: supabase db push --linked
-- (or the scripts/apply-*-migration.mjs pg pattern).

create table if not exists public.aoc_event_registrations (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  email         text not null unique,
  phone         text,                 -- optional; for closers / OpenPhone. Not sent to Kit.
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

create index if not exists aoc_event_registrations_created_at_idx
  on public.aoc_event_registrations (created_at desc);

create index if not exists aoc_event_registrations_kit_synced_idx
  on public.aoc_event_registrations (kit_synced);

-- No public policies. The API route + reconcile use the service role key and bypass RLS.
alter table public.aoc_event_registrations enable row level security;
