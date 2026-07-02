-- /aoc/free-training · asset-download lead capture.
-- Gated behind the "Download the Assets" modal on the free-training funnel page:
-- captures first name / email / phone plus explicit SMS+email marketing consent
-- before the visitor is handed the Dropbox asset link.
--
-- Idempotent. Apply: node --env-file=.env.local scripts/apply-free-training-leads-migration.mjs

create table if not exists public.aoc_free_training_leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  email text not null,
  phone text not null,
  -- true when the visitor checked the marketing-consent box (required by the form).
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists aoc_free_training_leads_created_at_idx
  on public.aoc_free_training_leads (created_at desc);

create index if not exists aoc_free_training_leads_email_idx
  on public.aoc_free_training_leads (email);

-- Service role only (the intake route uses the service-role key, which bypasses RLS;
-- with RLS enabled and no policies, nothing else can read it).
alter table public.aoc_free_training_leads enable row level security;
