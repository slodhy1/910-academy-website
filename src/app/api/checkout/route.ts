import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const { productSlug, customerEmail } = (await req.json()) as {
    productSlug?: string;
    customerEmail?: string;
  };
  if (!productSlug) {
    return NextResponse.json({ error: "productSlug required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, slug, stripe_price_id, stripe_payment_link, title")
    .eq("slug", productSlug)
    .single();

  if (productError || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Phase 1: products use Stripe payment links directly. Future: switch to price_id-driven Checkout Sessions.
  if (!product.stripe_price_id && product.stripe_payment_link) {
    return NextResponse.json({ url: product.stripe_payment_link });
  }

  if (!product.stripe_price_id) {
    return NextResponse.json(
      { error: "Product has no Stripe price configured" },
      { status: 400 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://910academy.com";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: product.stripe_price_id, quantity: 1 }],
    customer_email: customerEmail,
    success_url: `${siteUrl}/account?purchase=success`,
    cancel_url: `${siteUrl}/products/${productSlug}`,
    metadata: { product_slug: productSlug, product_id: product.id },
  });

  return NextResponse.json({ url: session.url });
}
