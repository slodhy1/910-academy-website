import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPurchaseConfirmedEmail } from "@/lib/email/purchase-confirmed";

const ACCESS_LINK = "https://www.910academy.com/account?purchase=success";

export type ProcessResult = {
  success: boolean;
  customerId?: string;
  wasNewCustomer?: boolean;
  error?: string;
  emailResult?: { success: boolean; error?: string };
};

export async function processCheckoutCompleted(
  event: Stripe.Event
): Promise<ProcessResult> {
  if (event.type !== "checkout.session.completed") {
    return { success: true };
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const email = session.customer_details?.email || session.customer_email;
  if (!email) {
    console.warn(
      "[stripe-webhook] checkout.session.completed without customer email",
      session.id
    );
    return { success: true };
  }

  const supabase = createAdminClient();

  let productSlug: string | undefined = session.metadata?.product_slug;

  if (!productSlug && session.payment_link) {
    const linkId =
      typeof session.payment_link === "string"
        ? session.payment_link
        : session.payment_link.id;
    console.log(`Webhook: matching payment_link ${linkId}`);
    const { data: p, error } = await supabase
      .from("products")
      .select("slug")
      .eq("stripe_payment_link_id", linkId)
      .maybeSingle();

    if (error) console.error("Product lookup error:", error);
    if (p) productSlug = p.slug;
  }

  if (!productSlug) {
    console.error(
      `Webhook: no product matched for session ${session.id}, payment_link=${session.payment_link}, metadata=`,
      session.metadata
    );
    return { success: true };
  }

  console.log(`Webhook: granting access for ${productSlug} to ${email}`);

  const { data: product } = await supabase
    .from("products")
    .select("id, title")
    .eq("slug", productSlug)
    .single();
  if (!product) {
    console.warn("[stripe-webhook] product row missing for slug", productSlug);
    return { success: true };
  }

  const { data: existing } = await supabase
    .from("customers")
    .select("id, auth_user_id")
    .eq("email", email)
    .maybeSingle();

  let customerId: string;
  let wasNewCustomer = false;

  if (existing) {
    customerId = existing.id;

    if (!existing.auth_user_id) {
      const matchedAuthId = await findAuthUserIdByEmail(supabase, email);
      if (matchedAuthId) {
        const { error: linkErr } = await supabase
          .from("customers")
          .update({ auth_user_id: matchedAuthId })
          .eq("id", customerId);
        if (linkErr) {
          console.error(
            "[stripe-webhook] failed to link auth user:",
            linkErr
          );
        } else {
          console.log(
            `[stripe-webhook] linked existing auth user ${matchedAuthId} to customer ${customerId}`
          );
        }
      }
    }
  } else {
    wasNewCustomer = true;

    const matchedAuthId = await findAuthUserIdByEmail(supabase, email);

    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : null;
    const { data: newCustomer, error: insertErr } = await supabase
      .from("customers")
      .insert({
        email,
        auth_user_id: matchedAuthId ?? null,
        stripe_customer_id: stripeCustomerId,
        full_name: session.customer_details?.name || null,
      })
      .select("id")
      .single();
    if (insertErr || !newCustomer) {
      console.error(
        "[stripe-webhook] customer row insert failed:",
        insertErr
      );
      return { success: false, error: "Customer insert failed" };
    }
    customerId = newCustomer.id;
    console.log(
      `[stripe-webhook] new customer: ${email}${
        matchedAuthId
          ? " (linked to existing auth user)"
          : " (no auth account yet)"
      }`
    );
  }

  const { error: cpErr } = await supabase
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
  if (cpErr) {
    console.error(
      "[stripe-webhook] customer_products upsert failed:",
      cpErr
    );
    return { success: false, error: "Grant insert failed" };
  }

  let emailResult: ProcessResult["emailResult"];
  const sendResult = await sendPurchaseConfirmedEmail({
    to: email,
    productName: product.title,
    accessLink: ACCESS_LINK,
  });
  emailResult = sendResult.success
    ? { success: true }
    : { success: false, error: sendResult.error };
  if (!sendResult.success) {
    console.error(
      "[stripe-webhook] purchase email failed (continuing):",
      sendResult.error
    );
  }

  return { success: true, customerId, wasNewCustomer, emailResult };
}

async function findAuthUserIdByEmail(
  supabase: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string | undefined> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    console.error("[stripe-webhook] auth list failed:", error);
    return undefined;
  }
  return data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )?.id;
}
