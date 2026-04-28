-- Phase 2D: products that ship a PDF (or any other non-video asset).
-- Adds two columns to public.products:
--   resource_type  - 'video' (default), 'pdf', or 'multi' (for products with multiple videos via product_videos)
--   resource_path  - storage bucket path, e.g. 'admin-assistant/910-admin-assistant-handbook.pdf'

alter table public.products
  add column if not exists resource_type text default 'video',
  add column if not exists resource_path text;

-- Add the check constraint separately so re-running the migration is safe.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'products_resource_type_check'
      and table_schema = 'public' and table_name = 'products'
  ) then
    alter table public.products
      add constraint products_resource_type_check
      check (resource_type in ('video', 'pdf', 'multi'));
  end if;
end$$;

-- Backfill: anything with a vimeo_id is video; instagram-masterclass is multi (uses product_videos).
update public.products set resource_type = 'video' where vimeo_id is not null and resource_type is distinct from 'multi';
update public.products set resource_type = 'multi' where slug = 'instagram-masterclass';

-- Private storage bucket for product resources (PDFs, etc.).
insert into storage.buckets (id, name, public)
values ('product-resources', 'product-resources', false)
on conflict (id) do nothing;

-- Service role can do anything on the bucket. Customer access happens via signed URLs from the server.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Service role full access on product-resources'
  ) then
    create policy "Service role full access on product-resources" on storage.objects
      for all using (
        bucket_id = 'product-resources' and auth.role() = 'service_role'
      ) with check (
        bucket_id = 'product-resources' and auth.role() = 'service_role'
      );
  end if;
end$$;
