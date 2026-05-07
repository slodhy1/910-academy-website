import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeIlike } from "@/lib/admin/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomersSearch } from "./customers-search";
import { RelativeTime } from "@/components/admin/relative-time";

export const dynamic = "force-dynamic";

type CustomerRow = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  auth_user_id: string | null;
  stripe_customer_id: string | null;
  customer_products: { count: number }[];
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const sb = createAdminClient();
  let builder = sb
    .from("customers")
    .select(
      "id, email, full_name, created_at, auth_user_id, stripe_customer_id, customer_products(count)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (query) {
    const escaped = escapeIlike(query);
    builder = builder.or(`email.ilike.%${escaped}%,full_name.ilike.%${escaped}%`);
  }

  const { data, count, error } = await builder;
  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-destructive text-sm">Could not load customers: {error.message}</p>
      </div>
    );
  }

  const rows = (data || []) as unknown as CustomerRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count != null ? `${count.toLocaleString()} total` : ""}
            {query ? ` · matching "${query}"` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            Export customers
          </Button>
          <Button variant="outline" size="sm" disabled>
            Export grants
          </Button>
        </div>
      </div>

      <CustomersSearch />

      {rows.length === 0 ? (
        <div className="border border-border rounded-md px-6 py-10 text-center">
          <p className="text-sm">
            {query ? `No customers matched "${query}".` : "No customers yet."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {query
              ? "Try a different email or name fragment."
              : "Customers appear here after their first Stripe checkout."}
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Grants</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const grantCount = row.customer_products?.[0]?.count ?? 0;
                const isLinked = !!row.auth_user_id;
                return (
                  <TableRow key={row.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/admin/customers/${row.id}`} className="hover:underline">
                        {row.email}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.full_name || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isLinked ? "default" : "secondary"}>
                        {isLinked ? "linked" : "unlinked"}
                      </Badge>
                    </TableCell>
                    <TableCell>{grantCount}</TableCell>
                    <TableCell>
                      <RelativeTime iso={row.created_at} className="text-muted-foreground text-sm" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {rows.length === 50 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing first 50. Use search to narrow.
        </p>
      )}
    </div>
  );
}
