import Link from "next/link";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="acct-nav">
        <div className="acct-nav-inner">
          <Link href="/" className="acct-nav-logo">
            <img src="/logo-white.svg" alt="910 Academy" width={36} height={36} />
          </Link>
          <div className="acct-nav-links">
            <Link href="/" className="acct-nav-link">Home</Link>
            <Link href="/account" className="acct-nav-link">Account</Link>
          </div>
        </div>
      </nav>
      <main className="acct-main">{children}</main>
      <footer className="acct-footer">
        <div className="acct-footer-logo">
          <img src="/logo-white.svg" alt="910 Academy" width={28} height={28} />
        </div>
        <p className="acct-footer-copy">&copy; 2026 910 Academy. All rights reserved.</p>
      </footer>
      <style>{`
        .acct-nav { position: fixed; top: 0; left: 0; width: 100%; z-index: 1000; padding: 20px 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(30px); border-bottom: 1px solid var(--border); }
        .acct-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; }
        .acct-nav-logo img { height: 36px; width: auto; }
        .acct-nav-links { display: flex; align-items: center; gap: 36px; }
        .acct-nav-link { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-muted); transition: color 0.2s; }
        .acct-nav-link:hover { color: var(--fg); }
        .acct-main { padding: 120px 24px 80px; max-width: 1100px; margin: 0 auto; min-height: calc(100vh - 200px); }
        .acct-footer { border-top: 1px solid var(--border); padding: 64px 40px; text-align: center; }
        .acct-footer-logo img { height: 28px; margin: 0 auto 24px; opacity: 0.7; }
        .acct-footer-copy { font-size: 12px; color: var(--fg-ghost); letter-spacing: 0.04em; }
        @media (max-width: 768px) {
          .acct-nav-inner { padding: 0 16px; }
          .acct-nav-links { gap: 20px; }
          .acct-main { padding: 100px 20px 64px; }
          .acct-footer { padding: 48px 24px; }
        }
      `}</style>
    </>
  );
}
