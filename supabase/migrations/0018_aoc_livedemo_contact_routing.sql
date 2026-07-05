-- /aoc/livedemo · Part 2: upfront contact capture + earnings-based routing.
-- Additive + idempotent. Extends 0017 for:
--   * name/email/phone captured on EVERY outcome (previously texting-only)
--   * multi-select Q3 (stored comma-joined in q3_focus; no column-type change)
--   * earnings-bucket routing -> phone / team Calendly / existing Calendly
--   * Booked-Calls status tracking (Routed -> Booked) via a client submission_id
-- outcome values are now 'phone' | 'booked' (was 'texting' | 'booked'); plain text, no change needed.
--
-- Apply: node --env-file=.env.local scripts/apply-aoc-livedemo-0018-migration.mjs

alter table public.aoc_livedemo_submissions
  add column if not exists submission_id uuid,
  add column if not exists email text,
  add column if not exists calendly text,        -- 'team' | 'existing' (booked rows only)
  add column if not exists booked_at timestamptz,
  add column if not exists status text;          -- 'Routed' | 'Booked' (booked rows only)

-- One row per lead, keyed by the client-generated submission_id (nulls allowed for legacy rows).
create unique index if not exists aoc_livedemo_submissions_submission_id_key
  on public.aoc_livedemo_submissions (submission_id);
