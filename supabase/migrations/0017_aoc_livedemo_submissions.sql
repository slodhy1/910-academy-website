-- /aoc/livedemo · demo-booking qualification funnel submissions.
-- One row per completed funnel: the 4 quiz answers + the server-recomputed
-- qualification + the outcome (booked = qualified→Calendly; texting = unqualified/
-- not-yet capture). full_name + phone are captured on the texting path only
-- (booked contact details arrive via Calendly's own notification). RLS-protected;
-- written via the service-role key.
--
-- Idempotent. Apply: node --env-file=.env.local scripts/apply-aoc-livedemo-migration.mjs

create table if not exists public.aoc_livedemo_submissions (
  id uuid primary key default gen_random_uuid(),
  q1_experience text not null,   -- "Haven't started yet" | "0-1 years" | "1-3 years" | "3+ years"
  q2_earnings   text not null,   -- "$0-$1,000" | "$1,000-$3,000" | "$3,000-$5,000" | "$5,000-$10,000" | "$10,000+"
  q3_focus      text not null,   -- "Shooting" | "Editing" | "Sales" | "Team Building" | "All of the above"
  q4_invest     text not null,   -- "Yes" | "No"
  qualified     boolean not null,          -- q2 in {$5,000-$10,000, $10,000+} AND q4 = "Yes"
  outcome       text not null,             -- 'booked' | 'texting'
  full_name     text,                      -- texting path only
  phone         text,                      -- texting path only
  created_at    timestamptz not null default now()
);

create index if not exists aoc_livedemo_submissions_created_at_idx
  on public.aoc_livedemo_submissions (created_at desc);

create index if not exists aoc_livedemo_submissions_outcome_idx
  on public.aoc_livedemo_submissions (outcome);

-- Service role only (the intake route uses the service-role key, which bypasses RLS;
-- with RLS enabled and no policies, nothing else can read it).
alter table public.aoc_livedemo_submissions enable row level security;
