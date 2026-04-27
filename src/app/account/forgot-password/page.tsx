"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/account/reset-password`,
    });
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="auth-card">
      <p className="auth-eyebrow">910 ACADEMY</p>
      <h1 className="auth-heading">Reset your password</h1>
      {submitted ? (
        <>
          <p className="auth-sub" style={{ marginTop: 24 }}>
            If an account exists for that email, you&apos;ll receive a reset link shortly.
          </p>
          <Link href="/account/login" className="auth-link">
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <p className="auth-sub">Enter the email address you used at checkout.</p>
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
            <button type="submit" disabled={loading} className="auth-btn">
              {loading ? "Sending..." : "Send reset link"}
            </button>
            <Link href="/account/login" className="auth-link">
              Back to sign in
            </Link>
          </form>
        </>
      )}
      <style>{`
        .auth-card { max-width: 440px; margin: 0 auto; padding: 48px 32px; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(255,255,255,0.02); }
        .auth-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); margin-bottom: 16px; text-align: center; }
        .auth-heading { font-size: 1.6rem; font-weight: 300; text-transform: uppercase; line-height: 1.15; text-align: center; margin-bottom: 8px; }
        .auth-sub { font-size: 0.95rem; color: var(--fg-muted); text-align: center; margin-bottom: 32px; line-height: 1.55; }
        .auth-form { display: flex; flex-direction: column; gap: 16px; }
        .auth-label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); }
        .auth-input { padding: 14px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: rgba(255,255,255,0.03); color: var(--fg); font-family: var(--font); font-size: 16px; }
        .auth-input:focus { outline: none; border-color: var(--accent); }
        .auth-btn { padding: 16px 24px; min-height: 48px; border-radius: var(--radius-sm); background: #FFF; color: #000; border: 1px solid #FFF; font-family: var(--font); font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; margin-top: 8px; }
        .auth-btn:hover:not(:disabled) { background: var(--accent); color: #FFF; border-color: var(--accent); }
        .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-link { display: block; text-align: center; font-size: 13px; color: var(--fg-muted); margin-top: 12px; }
        .auth-link:hover { color: var(--accent); }
      `}</style>
    </div>
  );
}
