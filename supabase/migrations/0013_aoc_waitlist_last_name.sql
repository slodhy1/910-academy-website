-- AOC waitlist · add last_name.
-- The /aoc form now collects First Name + Last Name as separate fields. The API stores
-- first_name and last_name separately (and keeps full_name = "First Last" for continuity).
-- Only first_name is sent to Kit; last_name is internal-only. Idempotent.
--
-- Apply via scripts/apply-aoc-last-name-migration.mjs (pg + SUPABASE_DB_URL).

alter table public.aoc_waitlist
  add column if not exists last_name text;
