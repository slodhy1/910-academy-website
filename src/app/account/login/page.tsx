"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    router.push("/account");
    router.refresh();
  }

  return (
    <div className="auth-card">
      <p className="auth-eyebrow">910 ACADEMY</p>
      <h1 className="auth-heading">Sign in</h1>
      <p className="auth-sub">Access your purchased products.</p>
      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="auth-input"
          />
        </label>
        <label className="auth-label">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="auth-input"
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={loading} className="auth-btn">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <Link href="/account/forgot-password" className="auth-link">
          Forgot your password?
        </Link>
        <Link href="/account/sign-up" className="auth-link">
          No account yet? Create one
        </Link>
      </form>
      <style>{`
        .auth-card { max-width: 440px; margin: 0 auto; padding: 48px 32px; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(255,255,255,0.02); }
        .auth-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); margin-bottom: 16px; text-align: center; }
        .auth-heading { font-size: 1.8rem; font-weight: 300; text-transform: uppercase; line-height: 1.1; text-align: center; margin-bottom: 8px; }
        .auth-sub { font-size: 0.95rem; color: var(--fg-muted); text-align: center; margin-bottom: 32px; }
        .auth-form { display: flex; flex-direction: column; gap: 16px; }
        .auth-label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); }
        .auth-input { padding: 14px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: rgba(255,255,255,0.03); color: var(--fg); font-family: var(--font); font-size: 16px; transition: border-color 0.2s; }
        .auth-input:focus { outline: none; border-color: var(--accent); }
        .auth-btn { padding: 16px 24px; min-height: 48px; border-radius: var(--radius-sm); background: #FFF; color: #000; border: 1px solid #FFF; font-family: var(--font); font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; margin-top: 8px; }
        .auth-btn:hover:not(:disabled) { background: var(--accent); color: #FFF; border-color: var(--accent); }
        .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-error { font-size: 13px; color: #ff6b6b; padding: 12px 14px; border-radius: var(--radius-sm); background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.25); }
        .auth-link { display: block; text-align: center; font-size: 13px; color: var(--fg-muted); margin-top: 12px; }
        .auth-link:hover { color: var(--accent); }
      `}</style>
    </div>
  );
}
