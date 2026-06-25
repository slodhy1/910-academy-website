-- Phase E1.5: Four Horsemen — Part 1 + Part 2 (shared sales page).
-- Idempotent. Apply via Supabase admin client or SQL editor.

insert into public.products (
  slug, title, short_description, long_description,
  price_cents, vimeo_id, vimeo_hash,
  thumbnail_url, stripe_payment_link, stripe_payment_link_id,
  resource_type, status
) values
  (
    'four-horsemen-part-1',
    'Four Horsemen — Part 1',
    'The business playbook behind a seven-figure real estate media company.',
    'Part 1 of the Four Horsemen workshop. Pricing, sales scripts, scaling beyond yourself, and the systems behind a seven-figure real estate media company. Designed for operators who want a real business, not a side hustle.',
    9100,
    '1167927978',
    '15a667bbc4',
    '/og-images/four-horsemen-workshop.jpg',
    'https://buy.stripe.com/00w3cublA9j0bWh0mj5Rm1B',
    'plink_1TUFAsBgZ35gA9jqLaeS67Ob',
    'video',
    'active'
  ),
  (
    'four-horsemen-part-2',
    'Four Horsemen — Part 2',
    'The post-production system that powers the Four Horsemen feed.',
    'Part 2 of the Four Horsemen workshop. The editing room: transitions, sound design, color, and the post-production system Four Horsemen use to ship work that lands at the top of the feed every time.',
    9100,
    '1170506222',
    '7fe30a4046',
    '/og-images/four-horsemen-workshop.jpg',
    'https://buy.stripe.com/cNi9ASdtIeDk4tPb0X5Rm1C',
    'plink_1TUFBlBgZ35gA9jqsEBVmujH',
    'video',
    'active'
  )
on conflict (slug) do update set
  title = excluded.title,
  short_description = excluded.short_description,
  long_description = excluded.long_description,
  price_cents = excluded.price_cents,
  vimeo_id = excluded.vimeo_id,
  vimeo_hash = excluded.vimeo_hash,
  thumbnail_url = excluded.thumbnail_url,
  stripe_payment_link = excluded.stripe_payment_link,
  stripe_payment_link_id = excluded.stripe_payment_link_id,
  resource_type = excluded.resource_type,
  status = excluded.status;
