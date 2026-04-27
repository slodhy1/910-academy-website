-- Phase 2C: Instagram Masterclass product (absorbs Build Your Instagram).
-- Run via Supabase SQL editor or `psql -f`. Idempotent.

insert into public.products (
  slug, title, short_description, long_description,
  price_cents, vimeo_id, vimeo_hash,
  thumbnail_url, stripe_payment_link, stripe_payment_link_id, status
) values (
  'instagram-masterclass',
  'The Instagram Masterclass',
  'Everything we know about building an Instagram following that converts to real-world client work.',
  'Two workshops bundled into one purchase. Workshop 1, the Instagram Masterclass, is the content + algorithm playbook for building reach on Instagram. Workshop 2, Build Your Instagram, is the companion 30-day makeover covering profile setup, on-camera confidence, and turning DMs into clients. Both unlock immediately after purchase.',
  9100,
  '1170793578',
  null,
  '/og-images/instagram-masterclass.jpg',
  'https://buy.stripe.com/dRmeVcfBQdzgbWh1qn5Rm1s',
  null,
  'active'
)
on conflict (slug) do update set
  title = excluded.title,
  short_description = excluded.short_description,
  long_description = excluded.long_description,
  price_cents = excluded.price_cents,
  vimeo_id = excluded.vimeo_id,
  thumbnail_url = excluded.thumbnail_url,
  stripe_payment_link = excluded.stripe_payment_link,
  status = excluded.status;

-- Insert the two videos that come with this product.
with ig_product as (
  select id from public.products where slug = 'instagram-masterclass'
)
insert into public.product_videos (
  product_id, vimeo_id, vimeo_hash, title, description, display_order
)
select
  ig_product.id,
  vid.vimeo_id, vid.vimeo_hash, vid.title, vid.description, vid.display_order
from ig_product, (values
  (
    '1170793578', null::text,
    'Workshop 1: The Instagram Masterclass',
    'The full content + algorithm playbook for building reach on Instagram.',
    1
  ),
  (
    '1172362926', null::text,
    'Workshop 2: Build Your Instagram',
    'The companion workshop covering profile setup, on-camera confidence, and the first 30 days of content.',
    2
  )
) as vid(vimeo_id, vimeo_hash, title, description, display_order)
on conflict (product_id, vimeo_id) do update set
  title = excluded.title,
  description = excluded.description,
  display_order = excluded.display_order;
