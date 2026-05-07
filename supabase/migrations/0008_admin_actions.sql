-- Phase G4 A3: admin_actions audit log table.
-- Idempotent. Apply via scripts/apply-admin-actions-migration.mjs.

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  admin_email text not null,
  action_type text not null check (action_type in (
    'grant_product','revoke_product','update_customer',
    'create_product','update_product','delete_product',
    'update_application','create_lead','update_lead','add_lead_note'
  )),
  customer_id uuid references public.customers(id),
  product_id uuid references public.products(id),
  application_id uuid references public.claudio_applications(id),
  lead_id uuid,
  metadata jsonb,
  performed_at timestamptz not null default now()
);

create index if not exists admin_actions_performed_at_idx
  on public.admin_actions (performed_at desc);
create index if not exists admin_actions_customer_id_idx
  on public.admin_actions (customer_id);
create index if not exists admin_actions_admin_user_id_idx
  on public.admin_actions (admin_user_id);

-- Lock down. Service role bypasses RLS for admin reads/writes.
alter table public.admin_actions enable row level security;
