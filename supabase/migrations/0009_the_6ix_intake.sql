-- The 6ix · Toronto event intake capture (Jun 5–6, 2026).
-- Captures purchase intent BEFORE the user is forwarded to Stripe checkout, so
-- we have name/email/phone/company even when Stripe fields are blank.
--
-- Idempotent. Apply via scripts/apply-the-6ix-intake-migration.mjs
-- (uses pg with SUPABASE_DB_URL).

create table if not exists public.the_6ix_intake (
  id uuid primary key default gen_random_uuid(),
  ticket_type text not null check (ticket_type in ('shooting', 'editing', 'both')),
  company_name text not null,
  full_name text not null,
  phone text not null,
  email text not null,
  created_at timestamptz not null default now(),
  -- Set once Stripe webhook confirms the purchase for this email/ticket combo.
  purchased_at timestamptz
);

create index if not exists the_6ix_intake_created_at_idx
  on public.the_6ix_intake (created_at desc);

create index if not exists the_6ix_intake_email_idx
  on public.the_6ix_intake (email);

create index if not exists the_6ix_intake_ticket_type_idx
  on public.the_6ix_intake (ticket_type);

-- Service role only.
alter table public.the_6ix_intake enable row level security;
