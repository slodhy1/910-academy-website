-- Phase 2A: Known Productions + JT Visuals products.
-- Run via Supabase SQL editor or `psql -f`. Idempotent on slug.

insert into public.products (
  slug, title, short_description, long_description,
  price_cents, vimeo_id, vimeo_hash,
  thumbnail_url, stripe_payment_link, stripe_payment_link_id, status
) values
(
  'known-productions-workshop',
  'The Art of Retention',
  'Known Productions is changing the game with new styles, new patterns, and a new ethos for real estate video.',
  '2 hours of tactical breakdowns from one of Instagram''s most viral real estate creators. Covers viral editing patterns, plugin and tool stack, music selection strategy, sales blueprint for charging clients more, and Instagram growth without paid ads.',
  9100,
  '1075782631',
  '63baf05123',
  '/whats-inside/known-productions-takeover.webp',
  'https://buy.stripe.com/7sI4iQbxP4QW7NmdRs',
  'plink_1RC7huBgZ35gA9jqSmYjhGD7',
  'active'
),
(
  'jt-visuals-workshop',
  'Become a World-Class Editor',
  'JT Visuals breaks down the editing flow, viral transitions, sound design, and speed-ramp formulas behind some of the smoothest real estate edits on the platform.',
  'The complete editing system: 7 viral transitions, the 10K followers in a week formula, sound design secrets, world-class speed ramps, and full camera gear and settings. Includes raw footage, XML timelines, an SFX pack, plugin links, and the JTV Script Assistant GPT.',
  9100,
  '1044727032',
  '93df7b2c46',
  '/whats-inside/jt-visuals-takeover.webp',
  'https://buy.stripe.com/6oEbLibxP8381oYeVn',
  'plink_1QcbLsBgZ35gA9jqDXP8JSbf',
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
  status = excluded.status;
