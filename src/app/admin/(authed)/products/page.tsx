import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RelativeTime } from "@/components/admin/relative-time";
import { formatCents } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  status: string;
  created_at: string;
  customer_products: { count: number }[];
};

export default async function ProductsPage() {
  await requireAdmin();
  const sb = createAdminClient();

  const { data, error } = await sb
    .from("products")
    .select("id, slug, title, price_cents, status, created_at, customer_products(count)")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Products</h1>
        <p className="text-destructive text-sm mt-2">Could not load: {error.message}</p>
      </div>
    );
  }

  const rows = (data || []) as unknown as ProductRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground mt-1">{rows.length} total</p>
        </div>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New product
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="border border-border rounded-md px-6 py-10 text-center">
          <p className="text-sm">No products yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create one to start selling.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Grants</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const grantCount = p.customer_products?.[0]?.count ?? 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/admin/products/${p.slug}/edit`}
                        className="font-medium hover:underline"
                      >
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {p.slug}
                    </TableCell>
                    <TableCell className="text-sm">{formatCents(p.price_cents)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === "active"
                            ? "default"
                            : p.status === "draft"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{grantCount}</TableCell>
                    <TableCell>
                      <RelativeTime
                        iso={p.created_at}
                        className="text-muted-foreground text-sm"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
