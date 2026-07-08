-- /aoc/livedemo · Part 3: A/B test + funnel lifecycle.
-- Additive + idempotent. Extends 0018 for:
--   * ab_variant  : 'A' | 'B' (the test arm; null for legacy/phone rows never assigned)
--   * started_at  : survey_started timestamp (row is now born at survey start, not completion)
-- Because rows are now created at survey_started (before answers exist), the answer/outcome
-- columns that 0017 made NOT NULL must become nullable; they are filled at survey_completed.
-- Existing rows already have values, so dropping NOT NULL does not affect them.
--
-- Apply: node --env-file=.env.local scripts/apply-aoc-livedemo-0019-migration.mjs

alter table public.aoc_livedemo_submissions
  add column if not exists ab_variant text,        -- 'A' | 'B'
  add column if not exists started_at timestamptz; -- survey_started

alter table public.aoc_livedemo_submissions
  alter column q1_experience drop not null,
  alter column q2_earnings   drop not null,
  alter column q3_focus      drop not null,
  alter column q4_invest     drop not null,
  alter column qualified     drop not null,
  alter column outcome       drop not null;
