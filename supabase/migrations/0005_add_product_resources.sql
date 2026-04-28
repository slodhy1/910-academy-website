-- Phase 3.5: Per-product external resources — plugins, downloads, codes, links.
-- One product → many resources (ordered for display).

create table if not exists public.product_resources (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  product_id uuid references public.products(id) on delete cascade not null,
  resource_type text not null check (resource_type in ('link', 'download', 'code')),
  title text not null,
  description text,
  url text,
  storage_path text,
  code_value text,
  display_order integer default 0 not null
);

alter table public.product_resources enable row level security;

-- Only customers who own the parent product can read resources.
drop policy if exists "product_resources owner read" on public.product_resources;
create policy "product_resources owner read" on public.product_resources
  for select using (
    product_id in (
      select cp.product_id
      from public.customer_products cp
      join public.customers c on c.id = cp.customer_id
      where c.auth_user_id = auth.uid()
    )
  );

create index if not exists product_resources_product_id_idx
  on public.product_resources(product_id);
create index if not exists product_resources_display_order_idx
  on public.product_resources(product_id, display_order);
