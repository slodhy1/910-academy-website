import Link from "next/link";

export default function ProductNotFound() {
  return (
    <div className="nf-wrap">
      <p className="nf-eyebrow">404</p>
      <h1 className="nf-title">Product not found</h1>
      <p className="nf-body">
        We couldn&apos;t find that product. It may have been renamed or removed.
      </p>
      <Link href="/account" className="nf-link">
        ← Back to your account
      </Link>
      <style>{`
        .nf-wrap { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding: 48px 0; }
        .nf-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); }
        .nf-title { font-size: clamp(1.6rem, 3.5vw, 2.4rem); font-weight: 300; text-transform: uppercase; line-height: 1.1; }
        .nf-body { color: var(--fg-muted); font-size: 0.95rem; max-width: 520px; }
        .nf-link { margin-top: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); transition: color 0.2s; }
        .nf-link:hover { color: var(--accent-hover); }
      `}</style>
    </div>
  );
}
