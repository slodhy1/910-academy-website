import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Invalid signature: ${message}` }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const email = session.customer_details?.email || session.customer_email;
  if (!email) {
    console.warn("[stripe-webhook] checkout.session.completed without customer email", session.id);
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  // Resolve product slug. First try metadata (Checkout Session route).
  // Fall back to looking up by payment_link id for the legacy buy.stripe.com flow.
  let productSlug: string | null = (session.metadata?.product_slug as string | null) || null;
  if (!productSlug && session.payment_link) {
    const linkId =
      typeof session.payment_link === "string" ? session.payment_link : session.payment_link.id;
    const { data: products } = await supabase
      .from("products")
      .select("slug, stripe_payment_link");
    const match = (products || []).find((p) =>
      typeof p.stripe_payment_link === "string" && p.stripe_payment_link.includes(linkId)
    );
    productSlug = match?.slug || null;
  }
  if (!productSlug) {
    console.warn("[stripe-webhook] could not resolve product for session", session.id);
    return NextResponse.json({ ok: true });
  }

  const { data: product } = await supabase
    .from("products")
    .select("id")
    .eq("slug", productSlug)
    .single();
  if (!product) {
    console.warn("[stripe-webhook] product row missing for slug", productSlug);
    return NextResponse.json({ ok: true });
  }

  // Find or create customer
  const { data: existing } = await supabase
    .from("customers")
    .select("id, auth_user_id")
    .eq("email", email)
    .maybeSingle();

  let customerId: string;
  if (existing) {
    customerId = existing.id;
  } else {
    const tempPassword = Math.random().toString(36).slice(-12) + "A1!";
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authErr || !authData?.user) {
      console.error("[stripe-webhook] auth user create failed:", authErr);
      return NextResponse.json({ error: "Auth create failed" }, { status: 500 });
    }
    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : null;
    const { data: newCustomer, error: insertErr } = await supabase
      .from("customers")
      .insert({
        email,
        auth_user_id: authData.user.id,
        stripe_customer_id: stripeCustomerId,
        full_name: session.customer_details?.name || null,
      })
      .select("id")
      .single();
    if (insertErr || !newCustomer) {
      console.error("[stripe-webhook] customer row insert failed:", insertErr);
      return NextResponse.json({ error: "Customer insert failed" }, { status: 500 });
    }
    customerId = newCustomer.id;
    // TODO Phase 1.5: trigger n8n / Resend welcome email with login URL + temp password.
    console.log(`[stripe-webhook] new customer created: ${email} | temp password: ${tempPassword}`);
  }

  await supabase
    .from("customer_products")
    .upsert(
      {
        customer_id: customerId,
        product_id: product.id,
        stripe_session_id: session.id,
        amount_paid_cents: session.amount_total ?? null,
      },
      { onConflict: "customer_id,product_id" }
    );

  return NextResponse.json({ ok: true });
}
