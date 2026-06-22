import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPurchaseConfirmedEmail } from "@/lib/email/purchase-confirmed";
import {
  sendThe6ixIntakeNotify,
  type TicketType,
} from "@/lib/email/the-6ix-intake-notify";
import { sendThe6ixConfirm } from "@/lib/email/the-6ix-confirm";
import { sendAocLiveConfirm } from "@/lib/email/aoc-live-confirm";
import { sendAocLiveIntakeNotify } from "@/lib/email/aoc-live-intake-notify";

const ACCESS_LINK = "https://www.910academy.com/account?purchase=success";

// AOC Live (West Palm Beach, July 11) Stripe Payment Link id. Buyers of this link
// get the in-person ticket confirmation email; it does NOT grant Academy access.
const AOC_LIVE_PAYMENT_LINK_ID = "plink_1TlGHVBgZ35gA9jqh96iFbi0";

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

  // The 6ix lead reconciliation: if there's an unpurchased intake row for
  // this email, mark it paid and notify the team. Independent from the
  // products-table flow below; 6ix tickets don't grant Academy access.
  await reconcileThe6ixIntake(supabase, email);

  // AOC Live ticket confirmation. Independent of the products grant flow below —
  // AOC Live sells via a Stripe Payment Link and grants no Academy access. Matched
  // by payment link id; a no-op for any other checkout.
  await handleAocLiveTicket(supabase, session, email);

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

/**
 * AOC Live · West Palm Beach, July 11 ticket confirmation.
 *
 * Fires only when the completed checkout came through the AOC Live Stripe Payment
 * Link. Sends the buyer the in-person ticket confirmation email. No DB row exists
 * for these (the landing page is static and forwards straight to Stripe), so the
 * buyer name comes from Stripe's customer_details. A non-matching session no-ops.
 */
async function handleAocLiveTicket(
  supabase: ReturnType<typeof createAdminClient>,
  session: Stripe.Checkout.Session,
  email: string
): Promise<void> {
  const linkId =
    typeof session.payment_link === "string"
      ? session.payment_link
      : session.payment_link?.id;
  if (linkId !== AOC_LIVE_PAYMENT_LINK_ID) return;

  const normalizedEmail = email.toLowerCase();

  // Most recent intake row for this email (saved by the modal before checkout).
  // Gives us the phone the buyer typed + a dedup guard against duplicate webhook
  // deliveries. Missing table / lookup error degrades to "no row" (still sends).
  const { data: rows, error: lookupErr } = await supabase
    .from("aoc_live_intake")
    .select("id, full_name, phone, purchased_at")
    .eq("email", normalizedEmail)
    .order("created_at", { ascending: false })
    .limit(1);
  if (lookupErr) console.error("[aoc-live] intake lookup failed:", lookupErr);

  const row = rows && rows.length ? rows[0] : null;

  // Dedup: an already-purchased most-recent row means we've handled this buyer —
  // a duplicate delivery. Skip so we don't double-send.
  if (row?.purchased_at) {
    console.log(`[aoc-live] duplicate delivery for ${normalizedEmail}, skipping`);
    return;
  }

  // Claim the row (gated on purchased_at null) so a concurrent delivery can't
  // double-send. If the claim affects no rows, another delivery beat us — skip.
  if (row) {
    const { data: claimed, error: claimErr } = await supabase
      .from("aoc_live_intake")
      .update({ purchased_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("purchased_at", null)
      .select("id");
    if (claimErr) console.error("[aoc-live] mark purchased failed:", claimErr);
    if (!claimed || claimed.length === 0) {
      console.log(`[aoc-live] row already claimed for ${normalizedEmail}, skipping`);
      return;
    }
  }

  // Prefer the intake row's data (has phone); fall back to Stripe's customer details
  // (e.g. buyer hit Stripe with a different email than the one in the modal).
  const fullName = row?.full_name || session.customer_details?.name || "";
  const phone = row?.phone || session.customer_details?.phone || "";

  const [confirm, notify] = await Promise.all([
    sendAocLiveConfirm({ to: email, fullName }),
    sendAocLiveIntakeNotify({
      fullName,
      email: normalizedEmail,
      phone,
      amountCents: session.amount_total ?? null,
    }),
  ]);
  if (!confirm.success) console.error("[aoc-live] buyer confirm failed:", confirm.error);
  if (!notify.success) console.error("[aoc-live] team notify failed:", notify.error);
  if (confirm.success && notify.success) {
    console.log(`[aoc-live] sold to ${normalizedEmail} (session ${session.id})`);
  }
}

/**
 * The 6ix · Toronto Jun 5–6 intake reconciliation.
 *
 * Find the most recent unpurchased row in the_6ix_intake for this email,
 * mark it purchased, then send the team notify email exactly once. If no
 * row matches (someone hit Stripe direct, or this was a non-6ix checkout)
 * we silently noop so the rest of the webhook keeps flowing.
 */
async function reconcileThe6ixIntake(
  supabase: ReturnType<typeof createAdminClient>,
  email: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase();
  const { data: rows, error: lookupErr } = await supabase
    .from("the_6ix_intake")
    .select("id, ticket_type, company_name, full_name, phone, email")
    .eq("email", normalizedEmail)
    .is("purchased_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (lookupErr) {
    console.error("[the-6ix-reconcile] lookup failed:", lookupErr);
    return;
  }
  if (!rows || rows.length === 0) {
    return;
  }

  const row = rows[0];
  const { error: updateErr } = await supabase
    .from("the_6ix_intake")
    .update({ purchased_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("purchased_at", null);
  if (updateErr) {
    console.error("[the-6ix-reconcile] mark purchased failed:", updateErr);
    return;
  }

  const [notifyResult, confirmResult] = await Promise.all([
    sendThe6ixIntakeNotify({
      ticketType: row.ticket_type as TicketType,
      companyName: row.company_name,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
    }),
    sendThe6ixConfirm({
      to: row.email,
      fullName: row.full_name,
      ticketType: row.ticket_type as TicketType,
    }),
  ]);

  if (!notifyResult.success) {
    console.error("[the-6ix-reconcile] team notify failed:", notifyResult.error);
  }
  if (!confirmResult.success) {
    console.error("[the-6ix-reconcile] buyer confirm failed:", confirmResult.error);
  }
  if (notifyResult.success && confirmResult.success) {
    console.log(
      `[the-6ix-reconcile] sold ${row.ticket_type} to ${row.email} (intake ${row.id})`
    );
  }
}
