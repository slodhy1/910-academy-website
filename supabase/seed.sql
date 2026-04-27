-- Seed: Lucid Horizon Workshop product
insert into public.products (
  slug, title, short_description, long_description,
  price_cents, vimeo_id, vimeo_hash,
  thumbnail_url, stripe_payment_link, stripe_payment_link_id, status
) values (
  'lucid-horizon-workshop',
  'The Lucid Method Workshop',
  'How Frank built one of the Hamptons most viral real estate brands in under a year, and the exact systems he used to do it.',
  '1.5 hours of tactical breakdowns from one of the Hamptons fastest-rising shooters. Full training on footage organization, shooting formula, editing workflow, music selection, stabilization, and the complete plugin and tool stack.',
  9100,
  '1088559714',
  'a95a1435cb',
  '/whats-inside/lucid-horizon-takeover.webp',
  'https://buy.stripe.com/3cI00i61g52K0dz2ur5Rm0I',
  'plink_1RRO7iBgZ35gA9jqKBDBaODl',
  'active'
) on conflict (slug) do update set
  title = excluded.title,
  short_description = excluded.short_description,
  long_description = excluded.long_description,
  price_cents = excluded.price_cents,
  vimeo_id = excluded.vimeo_id,
  vimeo_hash = excluded.vimeo_hash,
  thumbnail_url = excluded.thumbnail_url,
  stripe_payment_link = excluded.stripe_payment_link,
  stripe_payment_link_id = excluded.stripe_payment_link_id,
  status = excluded.status;
