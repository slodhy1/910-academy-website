-- Phase 1: products + customers + access grants
-- Project ref: qkmkxthpeapuecobahhx

create table if not exists public.customers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  email text not null unique,
  full_name text,
  stripe_customer_id text unique,
  auth_user_id uuid references auth.users(id) on delete set null
);

create table if not exists public.products (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  slug text not null unique,
  title text not null,
  short_description text,
  long_description text,
  price_cents integer not null,
  vimeo_id text,
  vimeo_hash text,
  thumbnail_url text,
  stripe_price_id text,
  stripe_payment_link text,
  status text default 'active' check (status in ('active', 'archived', 'draft'))
);

create table if not exists public.customer_products (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  customer_id uuid references public.customers(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  stripe_session_id text,
  amount_paid_cents integer,
  unique(customer_id, product_id)
);

-- RLS
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.customer_products enable row level security;

-- Customers can read their own row
drop policy if exists "customers read own" on public.customers;
create policy "customers read own" on public.customers
  for select using (auth.uid() = auth_user_id);

-- Products are public-readable
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products
  for select using (true);

-- Customers can read their own product grants
drop policy if exists "customer_products read own" on public.customer_products;
create policy "customer_products read own" on public.customer_products
  for select using (
    customer_id in (select id from public.customers where auth_user_id = auth.uid())
  );

-- Service role bypasses RLS automatically — webhook writes use the service role key.
