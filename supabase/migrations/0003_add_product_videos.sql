-- Phase 2C: products that ship with multiple videos.
-- One product → many videos (ordered).

create table if not exists public.product_videos (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  product_id uuid references public.products(id) on delete cascade not null,
  vimeo_id text not null,
  vimeo_hash text,
  title text not null,
  description text,
  display_order integer default 0 not null,
  unique(product_id, vimeo_id)
);

alter table public.product_videos enable row level security;

drop policy if exists "product_videos public read" on public.product_videos;
create policy "product_videos public read" on public.product_videos
  for select using (
    product_id in (select id from public.products where status = 'active')
  );

create index if not exists product_videos_product_id_idx
  on public.product_videos(product_id);
create index if not exists product_videos_display_order_idx
  on public.product_videos(product_id, display_order);
