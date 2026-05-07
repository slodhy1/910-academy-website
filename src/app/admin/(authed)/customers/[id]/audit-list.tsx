import { RelativeTime } from "@/components/admin/relative-time";

export type AuditEntry = {
  id: string;
  admin_email: string;
  action_type: string;
  metadata: Record<string, unknown> | null;
  performed_at: string;
};

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No admin actions recorded for this customer.</p>
    );
  }
  return (
    <ul className="space-y-3">
      {entries.map((e) => {
        const meta = (e.metadata || {}) as Record<string, string | undefined>;
        const productLabel = meta.product_title || meta.product_slug;
        return (
          <li key={e.id} className="text-sm border-l-2 border-border pl-3 py-1">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="font-medium">{labelFor(e.action_type)}</span>
                {productLabel ? <span className="text-muted-foreground"> · {productLabel}</span> : null}
              </div>
              <RelativeTime iso={e.performed_at} className="text-xs text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">by {e.admin_email}</p>
          </li>
        );
      })}
    </ul>
  );
}

function labelFor(type: string): string {
  switch (type) {
    case "grant_product":
      return "Granted product";
    case "revoke_product":
      return "Revoked product";
    case "update_customer":
      return "Updated customer";
    default:
      return type;
  }
}
