"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit";
import { sendAdminGrantNotify } from "@/lib/email/admin-grant-notify";

export type ActionResult =
  | { success: true; emailId?: string; emailError?: string }
  | { success: false; error: string };

export async function grantProductAction(
  customerId: string,
  productId: string
): Promise<ActionResult> {
  const adminUser = await requireAdmin();
  const sb = createAdminClient();

  // Verify both rows exist and grant doesn't already exist.
  const { data: customer, error: cErr } = await sb
    .from("customers")
    .select("id, email")
    .eq("id", customerId)
    .maybeSingle();
  if (cErr || !customer) {
    return { success: false, error: "Customer not found" };
  }
  const { data: product, error: pErr } = await sb
    .from("products")
    .select("id, slug, title")
    .eq("id", productId)
    .maybeSingle();
  if (pErr || !product) {
    return { success: false, error: "Product not found" };
  }

  const { data: existing } = await sb
    .from("customer_products")
    .select("id")
    .eq("customer_id", customerId)
    .eq("product_id", productId)
    .maybeSingle();
  if (existing) {
    return { success: false, error: "Customer already has this product" };
  }

  const { error: insErr } = await sb.from("customer_products").insert({
    customer_id: customerId,
    product_id: productId,
    stripe_session_id: null,
    amount_paid_cents: null,
  });
  if (insErr) {
    return { success: false, error: insErr.message };
  }

  // Fire the grant notify email. Failure must NOT roll back the grant — the
  // customer has access either way, and the email is recoverable. Log the
  // error into the audit metadata so it surfaces at the audit log later.
  const loginLink =
    (process.env.NEXT_PUBLIC_SITE_URL || "https://www.910academy.com") + "/account";
  const customerNameRow = await sb
    .from("customers")
    .select("full_name")
    .eq("id", customerId)
    .maybeSingle();
  const emailResult = await sendAdminGrantNotify({
    to: customer.email,
    customerName: customerNameRow.data?.full_name ?? null,
    productName: product.title,
    loginLink,
  });

  await logAdminAction(sb, {
    adminUserId: adminUser.id,
    adminEmail: adminUser.email!,
    actionType: "grant_product",
    customerId,
    productId,
    metadata: {
      product_slug: product.slug,
      product_title: product.title,
      customer_email: customer.email,
      email_id: emailResult.success ? emailResult.id : null,
      email_error: emailResult.success ? null : emailResult.error,
    },
  });

  revalidatePath(`/admin/customers/${customerId}`);
  return emailResult.success
    ? { success: true, emailId: emailResult.id }
    : { success: true, emailError: emailResult.error };
}

export async function revokeProductAction(
  customerId: string,
  productId: string
): Promise<ActionResult> {
  const adminUser = await requireAdmin();
  const sb = createAdminClient();

  const { data: customer } = await sb
    .from("customers")
    .select("id, email")
    .eq("id", customerId)
    .maybeSingle();
  const { data: product } = await sb
    .from("products")
    .select("id, slug, title")
    .eq("id", productId)
    .maybeSingle();

  const { error: delErr } = await sb
    .from("customer_products")
    .delete()
    .eq("customer_id", customerId)
    .eq("product_id", productId);
  if (delErr) {
    return { success: false, error: delErr.message };
  }

  await logAdminAction(sb, {
    adminUserId: adminUser.id,
    adminEmail: adminUser.email!,
    actionType: "revoke_product",
    customerId,
    productId,
    metadata: {
      product_slug: product?.slug,
      product_title: product?.title,
      customer_email: customer?.email,
    },
  });

  revalidatePath(`/admin/customers/${customerId}`);
  return { success: true };
}
