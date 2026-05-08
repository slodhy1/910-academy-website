import Link from "next/link";
import "@/app/globals.css";
import { LogoutButton } from "../logout-button";
import { PortalNav } from "./portal-nav";

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="portal-nav">
        <div className="portal-nav-inner">
          <Link href="/" className="portal-nav-logo" aria-label="910 Academy home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.svg" alt="910 Academy" width={36} height={36} />
          </Link>
          <PortalNav />
          <div className="portal-nav-right">
            <LogoutButton />
          </div>
        </div>
      </nav>
      <main className="portal-main">{children}</main>
      <footer className="portal-footer">
        <p className="portal-footer-copy">&copy; 2026 910 Academy. All rights reserved.</p>
      </footer>
      <style>{`
        .portal-nav { position: fixed; top: 0; left: 0; width: 100%; z-index: 1000; padding: 18px 0; background: rgba(0,0,0,0.55); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); border-bottom: 1px solid var(--border); }
        .portal-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .portal-nav-logo img { height: 36px; width: auto; opacity: 0.95; transition: opacity 0.2s; }
        .portal-nav-logo:hover img { opacity: 1; }
        .portal-nav-right { display: flex; align-items: center; }
        .portal-main { padding: 120px 24px 80px; max-width: 1100px; margin: 0 auto; min-height: calc(100vh - 200px); }
        .portal-footer { border-top: 1px solid var(--border); padding: 56px 40px; text-align: center; }
        .portal-footer-copy { font-size: 12px; color: var(--fg-ghost); letter-spacing: 0.04em; }
        @media (max-width: 768px) {
          .portal-nav-inner { padding: 0 16px; gap: 12px; }
          .portal-main { padding: 100px 20px 64px; }
          .portal-footer { padding: 40px 24px; }
        }
      `}</style>
    </>
  );
}
