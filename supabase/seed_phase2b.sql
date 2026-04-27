-- Phase 2B: Four Horsemen workshop, two parts.
-- The plink_ IDs are on Four Horsemen's own Stripe account (not 910 Academy's),
-- so stripe_payment_link_id is left null until they share the IDs and we wire up
-- inter-account webhook routing. Until then, this product is gated behind the
-- /maintenance rewrite (no allow-rule added to vercel.json yet).

insert into public.products (
  slug, title, short_description, long_description,
  price_cents, vimeo_id, vimeo_hash,
  thumbnail_url, stripe_payment_link, stripe_payment_link_id, status
) values
(
  'four-horsemen-part-1',
  'Four Horsemen Workshop: Part 1, The Business',
  'The full business playbook behind a seven-figure real estate media company.',
  'Part 1 of the Four Horsemen workshop. The business of scaling: pricing, sales scripts, building a team, client acquisition, and the operating cadence behind a profitable real estate media company. Lifetime access via your 910 Academy account.',
  9100,
  '1167927978',
  null,
  '/whats-inside/four-horsemen-takeover.webp',
  'https://buy.stripe.com/4gMdR95GS1lYbwWdAa7bW0n',
  null,
  'draft'
),
(
  'four-horsemen-part-2',
  'Four Horsemen Workshop: Part 2, The Editing',
  'The post-production system that powers the Four Horsemen feed.',
  'Part 2 of the Four Horsemen workshop. The editing room: timeline-to-export walkthrough, the seven viral transitions, sound design system, color workflow, music selection, and the full plugin stack with download links. Lifetime access via your 910 Academy account.',
  9100,
  '1172242879',
  null,
  '/whats-inside/four-horsemen-takeover.webp',
  'https://buy.stripe.com/28EdR9glw0hUdF42Vw7bW0o',
  null,
  'draft'
)
on conflict (slug) do update set
  title = excluded.title,
  short_description = excluded.short_description,
  long_description = excluded.long_description,
  price_cents = excluded.price_cents,
  vimeo_id = excluded.vimeo_id,
  thumbnail_url = excluded.thumbnail_url,
  stripe_payment_link = excluded.stripe_payment_link,
  stripe_payment_link_id = excluded.stripe_payment_link_id,
  status = excluded.status;
