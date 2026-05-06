import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ProductRow = {
  product: {
    id: string;
    slug: string;
    title: string;
    short_description: string | null;
    thumbnail_url: string | null;
  } | null;
};

export default async function AccountDashboard({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/account/login");

  // Look up customer row
  const { data: customer } = await supabase
    .from("customers")
    .select("id, full_name, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  // Fetch owned products via the join table
  let products: NonNullable<ProductRow["product"]>[] = [];
  if (customer) {
    const { data } = await supabase
      .from("customer_products")
      .select(`
        product:products (
          id, slug, title, short_description, thumbnail_url
        )
      `)
      .eq("customer_id", customer.id);
    products = ((data as ProductRow[] | null) || [])
      .map((r) => r.product)
      .filter((p): p is NonNullable<ProductRow["product"]> => p !== null);
  }

  const fullName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    customer?.full_name ||
    null;
  const greetingName =
    (fullName && fullName.trim().split(" ")[0]) ||
    user.email?.split("@")[0] ||
    "there";

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div>
          <p className="dash-eyebrow">YOUR ACCOUNT</p>
          <h1 className="dash-heading">Welcome back, {greetingName}.</h1>
        </div>
      </header>

      {params.purchase === "success" && (
        <div className="dash-flash">
          <strong>Purchase confirmed.</strong> Your new product should appear below within a minute.
        </div>
      )}

      <section className="dash-products">
        <p className="dash-section-label">YOUR PRODUCTS</p>
        {products.length === 0 ? (
          <div className="dash-empty">
            <p>You don&apos;t have any products yet.</p>
            <p className="dash-empty-sub">Browse our products to get started.</p>
          </div>
        ) : (
          <div className="dash-grid">
            {products.map((p) => (
              <Link key={p.id} href={`/account/products/${p.slug}`} className="dash-card">
                {p.thumbnail_url && (
                  <div className="dash-card-thumb">
                    {/* Static asset path inside Next.js public/ */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbnail_url} alt="" loading="lazy" />
                  </div>
                )}
                <div className="dash-card-body">
                  <h3 className="dash-card-title">{p.title}</h3>
                  {p.short_description && <p className="dash-card-desc">{p.short_description}</p>}
                  <span className="dash-card-cta">View →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <style>{`
        .dashboard { display: flex; flex-direction: column; gap: 48px; }
        .dash-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
        .dash-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
        .dash-heading { font-size: clamp(1.6rem, 3.5vw, 2.4rem); font-weight: 300; text-transform: uppercase; line-height: 1.1; }
        .dash-flash { padding: 14px 20px; border-radius: var(--radius-sm); border: 1px solid var(--accent-border-subtle); background: var(--accent-subtle); color: var(--fg); font-size: 14px; }
        .dash-section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: var(--fg-muted); margin-bottom: 24px; }
        .dash-empty { padding: 48px 32px; border: 1px dashed var(--border); border-radius: var(--radius-md); text-align: center; }
        .dash-empty p { font-size: 1rem; color: var(--fg); margin-bottom: 8px; }
        .dash-empty-sub { color: var(--fg-muted) !important; font-size: 0.9rem !important; }
        .dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
        .dash-card { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(255,255,255,0.02); overflow: hidden; transition: all 0.25s var(--ease-smooth); }
        .dash-card:hover { transform: translateY(-3px); border-color: var(--accent-border-subtle); background: var(--accent-subtle); }
        .dash-card-thumb { aspect-ratio: 1460 / 752; overflow: hidden; background: #111; }
        .dash-card-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .dash-card-body { padding: 24px; display: flex; flex-direction: column; gap: 8px; }
        .dash-card-title { font-size: 1.1rem; font-weight: 700; color: var(--fg); }
        .dash-card-desc { font-size: 0.9rem; color: var(--fg-muted); line-height: 1.55; }
        .dash-card-cta { margin-top: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
      `}</style>
    </div>
  );
}
