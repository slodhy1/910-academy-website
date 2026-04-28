-- Phase 2D: 910 Admin Assistant (PDF product, $299).
-- Stripe link + plink_ID are TBD until the payment link is created on Shayan's Stripe.

insert into public.products (
  slug, title, short_description, long_description,
  price_cents, vimeo_id, vimeo_hash,
  thumbnail_url, stripe_payment_link, stripe_payment_link_id, status,
  resource_type, resource_path
) values (
  '910-admin-assistant',
  '910 Admin Assistant',
  'The exact playbook Studio 910 uses to run seven-figure operations.',
  'A 150-page handbook covering every SOP, template, and process Studio 910 has built and refined over years of operating at the highest level. Stop building admin systems from scratch, copy ours.',
  29900,
  null,
  null,
  '/og-images/910-admin-assistant.jpg',
  null,
  null,
  'active',
  'pdf',
  'admin-assistant/910-admin-assistant-handbook.pdf'
)
on conflict (slug) do update set
  title = excluded.title,
  short_description = excluded.short_description,
  long_description = excluded.long_description,
  price_cents = excluded.price_cents,
  thumbnail_url = excluded.thumbnail_url,
  status = excluded.status,
  resource_type = excluded.resource_type,
  resource_path = excluded.resource_path;
