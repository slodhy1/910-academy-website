import Stripe from "stripe";

export type AdminCharge = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created: number;
  description: string | null;
  receipt_url: string | null;
};

let _client: Stripe | null = null;
function getStripe(): Stripe | null {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  _client = new Stripe(key);
  return _client;
}

/**
 * Pull up to `limit` recent charges for a customer. Tries the Stripe Search
 * API by email first; falls back to customer-id lookup. Returns [] if Stripe
 * is unconfigured. Errors are caught and surfaced as `error` so the caller
 * can render a graceful skeleton-fail.
 */
export async function getStripeChargesForCustomer({
  email,
  stripeCustomerId,
  limit = 10,
}: {
  email?: string | null;
  stripeCustomerId?: string | null;
  limit?: number;
}): Promise<{ charges: AdminCharge[]; error?: string }> {
  const stripe = getStripe();
  if (!stripe) return { charges: [], error: "Stripe not configured" };

  try {
    if (email) {
      const escaped = email.replace(/"/g, '\\"');
      const result = await stripe.charges.search({
        query: `email:"${escaped}"`,
        limit,
      });
      if (result.data.length > 0) {
        return { charges: result.data.map(toAdminCharge) };
      }
    }

    if (stripeCustomerId) {
      const result = await stripe.charges.list({
        customer: stripeCustomerId,
        limit,
      });
      return { charges: result.data.map(toAdminCharge) };
    }

    return { charges: [] };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[stripe-admin] charges fetch failed:", message);
    return { charges: [], error: message };
  }
}

function toAdminCharge(c: Stripe.Charge): AdminCharge {
  return {
    id: c.id,
    amount_cents: c.amount,
    currency: c.currency,
    status: c.status,
    created: c.created,
    description: c.description,
    receipt_url: c.receipt_url,
  };
}
