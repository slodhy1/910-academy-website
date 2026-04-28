-- Phase 2E + 2F: 3D Made Easy ($199) + 910 Sales System ($299).
-- Stripe links + plink_IDs are TBD until Shayan creates them on the 910 Academy Stripe.

-- 3D Made Easy
insert into public.products (
  slug, title, short_description, long_description,
  price_cents, vimeo_id, vimeo_hash,
  thumbnail_url, stripe_payment_link, stripe_payment_link_id, status,
  resource_type
) values (
  '3d-made-easy',
  '3D Made Easy',
  'The 910 system for adding viral 3D text and snap captions to real estate reels.',
  'Step-by-step workshop walking through the exact plugin stack, presets, and workflow Studio 910 uses to add the engagement-driving 3D text and white caption look to every real estate reel they ship.',
  19900,
  '1059797444',
  'c7004cd446',
  '/og-images/3d-made-easy.jpg',
  null,
  null,
  'active',
  'video'
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
  resource_type = excluded.resource_type;

-- 910 Sales System
insert into public.products (
  slug, title, short_description, long_description,
  price_cents, vimeo_id, vimeo_hash,
  thumbnail_url, stripe_payment_link, stripe_payment_link_id, status,
  resource_type
) values (
  '910-sales-system',
  '910 Sales System',
  'The exact phone process Studio 910 uses to attract clients, sell brand, and close deals at premium prices.',
  'A 1h 45min workshop plus the written sales system PDF. Covers the company brand economy, ideal client identification, the happy price framework, the 910 phone process, objection handling, and live role-play breakdowns.',
  29900,
  '1064864940',
  'e337e0c27e',
  '/og-images/910-sales-system.jpg',
  null,
  null,
  'active',
  'video'
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
  resource_type = excluded.resource_type;

-- NOTE: 910 Sales System has resource_type = 'video' but also ships a PDF.
-- For Phase 4 viewer work, consider adding a 'video+pdf' or extra columns.
-- For now the workshop video is primary; the PDF can be a download inside the gated viewer.
