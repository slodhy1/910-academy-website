import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignedResourceUrl } from "@/lib/supabase/storage";
import { LogoutButton } from "../../logout-button";
import { VideoViewer } from "@/components/account/VideoViewer";
import {
  MultiVideoViewer,
  type ProductVideo,
} from "@/components/account/MultiVideoViewer";
import { PdfViewer } from "@/components/account/PdfViewer";
import {
  ResourcesPanel,
  type ResourceRow,
} from "@/components/account/ResourcesPanel";
import { AboutDisclosure } from "@/components/account/AboutDisclosure";

export const dynamic = "force-dynamic";

type Product = {
  id: string;
  slug: string;
  title: string;
  long_description: string | null;
  vimeo_id: string | null;
  vimeo_hash: string | null;
  resource_type: "video" | "multi" | "pdf" | null;
  resource_path: string | null;
  status: "active" | "archived" | "draft" | null;
};

const TYPE_LABELS: Record<string, string> = {
  video: "Video workshop",
  multi: "Multi-part workshop",
  pdf: "PDF handbook",
};

export default async function ProductViewerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/account/login");

  const { data: product } = await supabase
    .from("products")
    .select(
      "id, slug, title, long_description, vimeo_id, vimeo_hash, resource_type, resource_path, status"
    )
    .eq("slug", slug)
    .maybeSingle<Product>();

  if (!product) notFound();
  if (product.status === "draft") notFound();

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!customer) redirect("/account");

  const { data: ownership } = await supabase
    .from("customer_products")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("product_id", product.id)
    .maybeSingle();
  if (!ownership) redirect("/account");

  const resourceType = product.resource_type ?? "video";

  let videos: ProductVideo[] = [];
  if (resourceType === "multi") {
    const { data } = await supabase
      .from("product_videos")
      .select("id, vimeo_id, vimeo_hash, title, description, display_order")
      .eq("product_id", product.id)
      .order("display_order", { ascending: true });
    videos = (data as ProductVideo[] | null) ?? [];
  }

  let pdfSignedUrl: string | null = null;
  if (resourceType === "pdf" && product.resource_path) {
    pdfSignedUrl = await getSignedResourceUrl(product.resource_path);
  }

  let bonusPdfSignedUrl: string | null = null;
  if (slug === "910-sales-system" && product.resource_path) {
    bonusPdfSignedUrl = await getSignedResourceUrl(product.resource_path);
  }

  const { data: resourcesData } = await supabase
    .from("product_resources")
    .select(
      "id, resource_type, title, description, url, storage_path, code_value, display_order"
    )
    .eq("product_id", product.id)
    .order("display_order", { ascending: true });
  const resources = (resourcesData as ResourceRow[] | null) ?? [];

  const downloadPaths = resources
    .filter((r) => r.resource_type === "download" && r.storage_path)
    .map((r) => r.storage_path as string);
  const signedUrlEntries = await Promise.all(
    downloadPaths.map(
      async (p) => [p, (await getSignedResourceUrl(p)) ?? ""] as const
    )
  );
  const signedUrls: Record<string, string> = Object.fromEntries(
    signedUrlEntries.filter(([, url]) => url)
  );

  const typeLabel = TYPE_LABELS[resourceType] ?? "Workshop";

  return (
    <div className="viewer">
      <header className="viewer-head">
        <div className="viewer-head-left">
          <Link href="/account" className="viewer-back">
            ← Back to your account
          </Link>
          <p className="viewer-eyebrow">{typeLabel}</p>
          <h1 className="viewer-title">{product.title}</h1>
        </div>
        <LogoutButton />
      </header>

      <div className="viewer-body">
        {resourceType === "video" && product.vimeo_id && (
          <VideoViewer
            vimeoId={product.vimeo_id}
            vimeoHash={product.vimeo_hash}
            title={product.title}
          />
        )}
        {resourceType === "multi" && <MultiVideoViewer videos={videos} />}
        {resourceType === "pdf" && pdfSignedUrl && (
          <PdfViewer signedUrl={pdfSignedUrl} filename={`${product.slug}.pdf`} />
        )}
        {resourceType === "pdf" && !pdfSignedUrl && (
          <div className="viewer-error">
            We couldn&apos;t generate a download link. Please refresh, or contact
            support if this persists.
          </div>
        )}

        <ResourcesPanel resources={resources} signedUrls={signedUrls} />

        {slug === "910-sales-system" && (
          <section className="bonus">
            <p className="bonus-eyebrow">Bonus Resources</p>
            <h2 className="bonus-title">910 Sales System PDF</h2>
            {bonusPdfSignedUrl ? (
              <a
                href={bonusPdfSignedUrl}
                download={`${product.slug}-handbook.pdf`}
                className="bonus-download"
              >
                Download PDF
              </a>
            ) : (
              <p className="bonus-placeholder">Bonus PDF coming soon.</p>
            )}
          </section>
        )}
      </div>

      {product.long_description && (
        <AboutDisclosure description={product.long_description} />
      )}

      <style>{`
        .viewer { display: flex; flex-direction: column; gap: 40px; }
        .viewer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
        .viewer-head-left { display: flex; flex-direction: column; gap: 8px; }
        .viewer-back { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); transition: color 0.2s; margin-bottom: 8px; }
        .viewer-back:hover { color: var(--accent); }
        .viewer-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); }
        .viewer-title { font-size: clamp(1.6rem, 3.5vw, 2.4rem); font-weight: 300; text-transform: uppercase; line-height: 1.1; color: var(--fg); }
        .viewer-body { display: flex; flex-direction: column; gap: 56px; }
        .viewer-error { padding: 32px; border: 1px dashed var(--border); border-radius: var(--radius-md); text-align: center; color: var(--fg-muted); }
        .bonus { display: flex; flex-direction: column; gap: 12px; max-width: 1100px; margin: 0 auto; width: 100%; padding: 32px; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(255,255,255,0.02); }
        .bonus-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); }
        .bonus-title { font-size: 1.2rem; font-weight: 500; color: var(--fg); }
        .bonus-download { align-self: flex-start; margin-top: 8px; padding: 10px 18px; border-radius: var(--radius-sm); border: 1px solid var(--accent); background: var(--accent-subtle); color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; transition: all 0.2s; }
        .bonus-download:hover { background: var(--accent); color: #000; }
        .bonus-placeholder { color: var(--fg-muted); font-size: 0.95rem; font-style: italic; }
      `}</style>
    </div>
  );
}
