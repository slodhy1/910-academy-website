import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { GrantForm } from "./grant-form";
import { RevokeButton } from "./revoke-button";
import { AuditList, type AuditEntry } from "./audit-list";
import { StripeCharges, StripeChargesSkeleton } from "./stripe-charges";

export const dynamic = "force-dynamic";

type GrantRow = {
  id: string;
  created_at: string;
  amount_paid_cents: number | null;
  stripe_session_id: string | null;
  product: {
    id: string;
    slug: string;
    title: string;
    short_description: string | null;
  } | null;
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sb = createAdminClient();

  const { data: customer, error: cErr } = await sb
    .from("customers")
    .select("id, email, full_name, created_at, auth_user_id, stripe_customer_id")
    .eq("id", id)
    .maybeSingle();
  if (cErr || !customer) notFound();

  const [grantsResult, productsResult, auditResult] = await Promise.all([
    sb
      .from("customer_products")
      .select(
        "id, created_at, amount_paid_cents, stripe_session_id, product:products(id, slug, title, short_description)"
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    sb
      .from("products")
      .select("id, slug, title, status")
      .eq("status", "active")
      .order("title"),
    sb
      .from("admin_actions")
      .select("id, admin_email, action_type, metadata, performed_at")
      .eq("customer_id", id)
      .order("performed_at", { ascending: false })
      .limit(20),
  ]);

  const grants = ((grantsResult.data as unknown) as GrantRow[]) || [];
  const allActiveProducts = productsResult.data || [];
  const grantedProductIds = new Set(grants.map((g) => g.product?.id).filter(Boolean));
  const availableProducts = allActiveProducts.filter((p) => !grantedProductIds.has(p.id));
  const auditEntries: AuditEntry[] = (auditResult.data || []) as AuditEntry[];

  const fullName = customer.full_name || customer.email.split("@")[0];

  return (
    <div className="space-y-6">
      <Link
        href="/admin/customers"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Customers
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-2xl">{fullName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{customer.email}</p>
            </div>
            <Badge variant={customer.auth_user_id ? "default" : "secondary"}>
              {customer.auth_user_id ? "Auth linked" : "Auth unlinked"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Joined</p>
            <p className="mt-1">
              <RelativeTime iso={customer.created_at} />
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Stripe customer</p>
            <p className="mt-1 font-mono text-xs break-all">
              {customer.stripe_customer_id || "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Grants</p>
            <p className="mt-1">{grants.length}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Granted products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products granted yet.</p>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Granted</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grants.map((g) =>
                    g.product ? (
                      <TableRow key={g.id}>
                        <TableCell>
                          <p className="font-medium">{g.product.title}</p>
                          <p className="text-xs text-muted-foreground">{g.product.slug}</p>
                        </TableCell>
                        <TableCell>
                          <RelativeTime iso={g.created_at} className="text-sm text-muted-foreground" />
                        </TableCell>
                        <TableCell className="text-sm">
                          {g.amount_paid_cents != null
                            ? formatCents(g.amount_paid_cents)
                            : <span className="text-muted-foreground">manual</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <RevokeButton
                            customerId={customer.id}
                            productId={g.product.id}
                            productTitle={g.product.title}
                            customerEmail={customer.email}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Grant a product</p>
            <GrantForm customerId={customer.id} availableProducts={availableProducts} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Stripe charges</CardTitle>
          <p className="text-xs text-muted-foreground">
            Last 10 charges matching this email. Search across all Stripe customer ids.
          </p>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<StripeChargesSkeleton />}>
            <StripeCharges
              email={customer.email}
              stripeCustomerId={customer.stripe_customer_id}
            />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Audit log</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditList entries={auditEntries} />
        </CardContent>
      </Card>
    </div>
  );
}
