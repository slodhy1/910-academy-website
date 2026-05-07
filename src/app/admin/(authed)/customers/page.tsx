// Phase B1 placeholder. Real implementation lands in next commit.
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireAdmin();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Customers</h1>
      <p className="text-muted-foreground text-sm">List + search lands in Phase B1.</p>
    </div>
  );
}
