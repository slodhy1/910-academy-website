import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { ProductForm, EMPTY_PRODUCT } from "../product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <Link
        href="/admin/products"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Products
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">New product</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a product. Set status to active when ready to sell.
        </p>
      </div>
      <ProductForm mode="create" initial={EMPTY_PRODUCT} />
    </div>
  );
}
