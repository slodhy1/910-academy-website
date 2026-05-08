"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit";

export type ProductInput = {
  slug: string;
  title: string;
  short_description: string | null;
  long_description: string | null;
  price_cents: number;
  vimeo_id: string | null;
  vimeo_hash: string | null;
  thumbnail_url: string | null;
  stripe_price_id: string | null;
  stripe_payment_link: string | null;
  stripe_payment_link_id: string | null;
  resource_type: string | null;
  status: "active" | "archived" | "draft";
};

export type ActionResult =
  | { success: true; slug: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_STATUSES = ["active", "archived", "draft"] as const;
const VALID_RESOURCE_TYPES = ["video", "pdf"] as const;

function parseFormData(formData: FormData): { input: ProductInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!slug) errors.slug = "Required";
  else if (!SLUG_RE.test(slug)) errors.slug = "Lowercase letters, numbers, hyphens only";
  else if (slug.length > 100) errors.slug = "Max 100 characters";

  const title = String(formData.get("title") ?? "").trim();
  if (!title) errors.title = "Required";
  else if (title.length > 200) errors.title = "Max 200 characters";

  const priceRaw = String(formData.get("price_cents") ?? "").trim();
  const priceCents = Number.parseInt(priceRaw, 10);
  if (priceRaw === "") errors.price_cents = "Required";
  else if (!Number.isInteger(priceCents) || priceCents < 0) errors.price_cents = "Whole number, zero or higher";
  else if (priceCents > 100_000_000) errors.price_cents = "Max 1,000,000 dollars";

  const status = String(formData.get("status") ?? "").trim();
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    errors.status = "Invalid status";
  }

  const resourceTypeRaw = String(formData.get("resource_type") ?? "").trim();
  const resourceType = resourceTypeRaw === "" ? null : resourceTypeRaw;
  if (resourceType && !VALID_RESOURCE_TYPES.includes(resourceType as (typeof VALID_RESOURCE_TYPES)[number])) {
    errors.resource_type = "Must be video, pdf, or empty";
  }

  const optString = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  const input: ProductInput = {
    slug,
    title,
    short_description: optString("short_description"),
    long_description: optString("long_description"),
    price_cents: Number.isInteger(priceCents) ? priceCents : 0,
    vimeo_id: optString("vimeo_id"),
    vimeo_hash: optString("vimeo_hash"),
    thumbnail_url: optString("thumbnail_url"),
    stripe_price_id: optString("stripe_price_id"),
    stripe_payment_link: optString("stripe_payment_link"),
    stripe_payment_link_id: optString("stripe_payment_link_id"),
    resource_type: resourceType,
    status: (status as "active" | "archived" | "draft") || "draft",
  };

  return { input, errors };
}

export async function createProductAction(formData: FormData): Promise<ActionResult> {
  const adminUser = await requireAdmin();
  const sb = createAdminClient();

  const { input, errors } = parseFormData(formData);
  if (Object.keys(errors).length > 0) {
    return { success: false, error: "Fix the highlighted fields", fieldErrors: errors };
  }

  // Slug uniqueness
  const { data: dupe } = await sb.from("products").select("id").eq("slug", input.slug).maybeSingle();
  if (dupe) {
    return { success: false, error: "Slug already in use", fieldErrors: { slug: "Slug already exists" } };
  }

  const { data: inserted, error: insErr } = await sb
    .from("products")
    .insert(input)
    .select("id, slug")
    .single();
  if (insErr || !inserted) {
    return { success: false, error: insErr?.message ?? "Could not create product" };
  }

  await logAdminAction(sb, {
    adminUserId: adminUser.id,
    adminEmail: adminUser.email!,
    actionType: "create_product",
    productId: inserted.id,
    metadata: {
      slug: inserted.slug,
      title: input.title,
      price_cents: input.price_cents,
      status: input.status,
    },
  });

  revalidatePath("/admin/products");
  return { success: true, slug: inserted.slug };
}

export async function updateProductAction(
  productId: string,
  formData: FormData
): Promise<ActionResult> {
  const adminUser = await requireAdmin();
  const sb = createAdminClient();

  const { input, errors } = parseFormData(formData);
  if (Object.keys(errors).length > 0) {
    return { success: false, error: "Fix the highlighted fields", fieldErrors: errors };
  }

  const { data: existing } = await sb
    .from("products")
    .select("id, slug")
    .eq("id", productId)
    .maybeSingle();
  if (!existing) {
    return { success: false, error: "Product not found" };
  }

  // Slug uniqueness (only if changed)
  if (input.slug !== existing.slug) {
    const { data: dupe } = await sb
      .from("products")
      .select("id")
      .eq("slug", input.slug)
      .neq("id", productId)
      .maybeSingle();
    if (dupe) {
      return { success: false, error: "Slug already in use", fieldErrors: { slug: "Slug already exists" } };
    }
  }

  const { error: upErr } = await sb.from("products").update(input).eq("id", productId);
  if (upErr) {
    return { success: false, error: upErr.message };
  }

  await logAdminAction(sb, {
    adminUserId: adminUser.id,
    adminEmail: adminUser.email!,
    actionType: "update_product",
    productId,
    metadata: {
      slug: input.slug,
      title: input.title,
      price_cents: input.price_cents,
      status: input.status,
      previous_slug: existing.slug !== input.slug ? existing.slug : undefined,
    },
  });

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${input.slug}/edit`);
  if (existing.slug !== input.slug) {
    revalidatePath(`/admin/products/${existing.slug}/edit`);
  }
  return { success: true, slug: input.slug };
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  const adminUser = await requireAdmin();
  const sb = createAdminClient();

  const { data: product } = await sb
    .from("products")
    .select("id, slug, title")
    .eq("id", productId)
    .maybeSingle();
  if (!product) {
    return { success: false, error: "Product not found" };
  }

  // count grants for the audit metadata
  const { count: grantCount } = await sb
    .from("customer_products")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  const { error: delErr } = await sb.from("products").delete().eq("id", productId);
  if (delErr) {
    return { success: false, error: delErr.message };
  }

  await logAdminAction(sb, {
    adminUserId: adminUser.id,
    adminEmail: adminUser.email!,
    actionType: "delete_product",
    productId: null, // row is gone; preserve metadata only
    metadata: {
      slug: product.slug,
      title: product.title,
      grants_cascaded: grantCount ?? 0,
    },
  });

  revalidatePath("/admin/products");
  redirect("/admin/products");
}
