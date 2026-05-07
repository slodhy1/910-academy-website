-- Phase G2: Claudio 1:1 application capture.
-- Idempotent. Apply via scripts/apply-claudio-applications-migration.mjs
-- (uses pg with SUPABASE_DB_URL).

create table if not exists public.claudio_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  business_name text,
  portfolio_url text,
  help_type text not null,
  budget_range text not null,
  goal text not null,
  additional_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  status text not null default 'pending'
);

create index if not exists claudio_applications_created_at_idx
  on public.claudio_applications (created_at desc);

create index if not exists claudio_applications_status_idx
  on public.claudio_applications (status);

-- Lock down. Service role bypasses RLS, which is the only path that needs
-- to insert/read; nothing else should touch this table.
alter table public.claudio_applications enable row level security;
