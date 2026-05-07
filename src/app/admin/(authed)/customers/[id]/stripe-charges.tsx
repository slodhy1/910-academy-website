import { getStripeChargesForCustomer } from "@/lib/stripe/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/admin/relative-time";

export async function StripeCharges({
  email,
  stripeCustomerId,
}: {
  email: string;
  stripeCustomerId: string | null;
}) {
  const { charges, error } = await getStripeChargesForCustomer({
    email,
    stripeCustomerId,
    limit: 10,
  });

  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load Stripe charges: {error}
      </p>
    );
  }

  if (charges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No Stripe charges on record for this email.</p>
    );
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Receipt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {charges.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <RelativeTime
                  iso={new Date(c.created * 1000).toISOString()}
                  className="text-sm"
                />
              </TableCell>
              <TableCell className="text-sm">
                ${(c.amount_cents / 100).toFixed(2)}{" "}
                <span className="text-xs text-muted-foreground uppercase">{c.currency}</span>
              </TableCell>
              <TableCell>
                <Badge variant={c.status === "succeeded" ? "default" : "secondary"}>
                  {c.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                {c.description || "-"}
              </TableCell>
              <TableCell>
                {c.receipt_url ? (
                  <a
                    href={c.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function StripeChargesSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-12 bg-muted/40 rounded animate-pulse"
        />
      ))}
    </div>
  );
}
