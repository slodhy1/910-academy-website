import type Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeEmail } from "@/lib/email/welcome";

export type ProcessResult = {
  success: boolean;
  customerId?: string;
  wasNewUser?: boolean;
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
  let wasNewUser = false;
  let tempPassword: string | undefined;

  if (existing) {
    customerId = existing.id;
  } else {
    wasNewUser = true;
    tempPassword = randomBytes(12).toString("base64url").slice(0, 16);

    let authUserId: string | undefined;
    const { data: authData, error: authErr } =
      await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

    if (authErr) {
      const msg = (authErr.message ?? "").toLowerCase();
      const looksLikeDuplicate =
        (authErr as { code?: string }).code === "email_exists" ||
        authErr.status === 422 ||
        msg.includes("already registered") ||
        msg.includes("already been registered") ||
        msg.includes("already exists");

      if (!looksLikeDuplicate) {
        console.error("[stripe-webhook] auth user create failed:", authErr);
        return { success: false, error: "Auth create failed" };
      }

      // Recover from a prior failed attempt (or returning customer with an
      // existing auth row but no customers row). Look up the existing user.
      // TODO: distinguish genuine orphans (no customer_products rows for any
      // product under this auth user) from returning customers, and for true
      // orphans reset the password via auth.admin.updateUserById and send a
      // welcome email with the new password. For now we skip the email so we
      // never disrupt a real logged-in returning customer's session.
      console.warn(
        "[stripe-webhook] auth user already exists, recovering by lookup:",
        email
      );
      const { data: list, error: listErr } =
        await supabase.auth.admin.listUsers({ perPage: 200 });
      if (listErr) {
        console.error("[stripe-webhook] auth list failed:", listErr);
        return { success: false, error: "Auth lookup failed" };
      }
      const match = list.users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (!match) {
        console.error(
          "[stripe-webhook] auth said duplicate but lookup found no match:",
          email
        );
        return { success: false, error: "Auth lookup miss" };
      }
      authUserId = match.id;
      tempPassword = undefined;
    } else if (authData?.user) {
      authUserId = authData.user.id;
    }

    if (!authUserId) {
      return { success: false, error: "Auth user resolution failed" };
    }

    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : null;
    const { data: newCustomer, error: insertErr } = await supabase
      .from("customers")
      .insert({
        email,
        auth_user_id: authUserId,
        stripe_customer_id: stripeCustomerId,
        full_name: session.customer_details?.name || null,
      })
      .select("id")
      .single();
    if (insertErr || !newCustomer) {
      console.error("[stripe-webhook] customer row insert failed:", insertErr);
      return { success: false, error: "Customer insert failed" };
    }
    customerId = newCustomer.id;
    console.log(
      `[stripe-webhook] new customer created: ${email}${
        tempPassword ? "" : " (recovered orphan, no password reset)"
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
    console.error("[stripe-webhook] customer_products upsert failed:", cpErr);
    return { success: false, error: "Grant insert failed" };
  }

  let emailResult: ProcessResult["emailResult"];
  if (wasNewUser && tempPassword) {
    const sendResult = await sendWelcomeEmail({
      to: email,
      productName: product.title,
      tempPassword,
    });
    emailResult = sendResult.success
      ? { success: true }
      : { success: false, error: sendResult.error };
    if (!sendResult.success) {
      console.error(
        "[stripe-webhook] welcome email failed (continuing):",
        sendResult.error
      );
    }
  }

  return { success: true, customerId, wasNewUser, emailResult };
}
