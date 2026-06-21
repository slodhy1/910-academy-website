-- AOC waitlist · add full_name.
-- The /aoc form now collects a single "Full Name" instead of first name. The API
-- stores the whole value in full_name and keeps first_name = the first token of the
-- full name, so Kit email personalization still greets by first name.
--
-- Idempotent. Apply via scripts/apply-aoc-full-name-migration.mjs (pg + SUPABASE_DB_URL).

alter table public.aoc_waitlist
  add column if not exists full_name text;
