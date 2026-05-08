import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProductForm, type ProductFormValues } from "../../product-form";
import { DeleteProductButton } from "./delete-product-button";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const sb = createAdminClient();

  const { data: product } = await sb
    .from("products")
    .select(
      "id, slug, title, short_description, long_description, price_cents, vimeo_id, vimeo_hash, thumbnail_url, stripe_price_id, stripe_payment_link, stripe_payment_link_id, resource_type, status"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!product) notFound();

  const { count: grantCount } = await sb
    .from("customer_products")
    .select("id", { count: "exact", head: true })
    .eq("product_id", product.id);

  const initial: ProductFormValues = {
    slug: product.slug,
    title: product.title,
    short_description: product.short_description ?? "",
    long_description: product.long_description ?? "",
    price_cents: product.price_cents ?? 0,
    vimeo_id: product.vimeo_id ?? "",
    vimeo_hash: product.vimeo_hash ?? "",
    thumbnail_url: product.thumbnail_url ?? "",
    stripe_price_id: product.stripe_price_id ?? "",
    stripe_payment_link: product.stripe_payment_link ?? "",
    stripe_payment_link_id: product.stripe_payment_link_id ?? "",
    resource_type: product.resource_type ?? "",
    status: (product.status ?? "draft") as ProductFormValues["status"],
  };

  return (
    <div className="space-y-6">
      <Link
        href="/admin/products"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Products
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{product.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {grantCount ?? 0} customer grant{(grantCount ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
        <DeleteProductButton
          productId={product.id}
          title={product.title}
          slug={product.slug}
          grantCount={grantCount ?? 0}
        />
      </div>

      <ProductForm mode="edit" productId={product.id} initial={initial} />
    </div>
  );
}
