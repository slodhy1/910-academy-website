-- Add Stripe payment-link ID column for webhook matching.
-- Stripe sends `session.payment_link` as a `plink_…` ID, not the buy.stripe.com URL,
-- so we need a dedicated column to look up products from incoming webhook events.

alter table public.products
  add column if not exists stripe_payment_link_id text unique;

create index if not exists products_stripe_payment_link_id_idx
  on public.products(stripe_payment_link_id);
