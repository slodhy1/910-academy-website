import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="auth-shell">
        <Link href="/" className="auth-logo" aria-label="910 Academy home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.svg" alt="910 Academy" width={36} height={36} />
        </Link>
        <main className="auth-shell-main">{children}</main>
        <Link href="/" className="auth-shell-back">
          ← Back to home
        </Link>
      </div>
      <style>{`
        .auth-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 64px 24px 48px;
          gap: 32px;
        }
        .auth-logo { display: inline-block; opacity: 0.95; transition: opacity 0.2s; }
        .auth-logo:hover { opacity: 1; }
        .auth-logo img { height: 36px; width: auto; display: block; }
        .auth-shell-main {
          width: 100%;
          max-width: 480px;
          display: flex;
          justify-content: center;
        }
        .auth-shell-back {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-muted);
          transition: color 0.2s;
        }
        .auth-shell-back:hover { color: var(--accent); }
        @media (max-width: 600px) {
          .auth-shell { padding: 48px 16px 32px; gap: 28px; }
        }
      `}</style>
    </>
  );
}
