-- AOC Live · West Palm Beach in-person event intake capture (July 11, 2026).
-- Captures purchase intent (name/email/phone) BEFORE the user is forwarded to the
-- Stripe payment link, so we keep full contact info for follow-ups even though the
-- static landing page can't read those details back from Stripe.
--
-- Idempotent. Apply via the Supabase CLI (supabase db push).

create table if not exists public.aoc_live_intake (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text not null,
  created_at timestamptz not null default now(),
  -- Set once the Stripe webhook confirms the purchase for this email.
  purchased_at timestamptz
);

create index if not exists aoc_live_intake_created_at_idx
  on public.aoc_live_intake (created_at desc);

create index if not exists aoc_live_intake_email_idx
  on public.aoc_live_intake (email);

-- Service role only (the webhook + intake route use the service-role key, which
-- bypasses RLS; with RLS enabled and no policies, nothing else can read it).
alter table public.aoc_live_intake enable row level security;
