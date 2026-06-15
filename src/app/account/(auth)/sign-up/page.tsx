"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  PasswordInput,
  MinLengthIndicator,
  MatchIndicator,
} from "@/components/PasswordInput";
import { signUpAndLink } from "./actions";

const isEmailLooking = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="auth-card" />}>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const params = useSearchParams();
  const justPurchased = params.get("purchase") === "success";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const formValid =
    fullName.trim().length > 0 &&
    isEmailLooking(email.trim()) &&
    password.length >= 8 &&
    confirm === password;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!formValid) return;

    setLoading(true);
    const result = await signUpAndLink({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
    });
    // success-with-session: server action redirected; this code does not run.
    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }
    if (result.needsSignIn) {
      setError("Account created. Please sign in to continue.");
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <p className="auth-eyebrow">910 ACADEMY</p>
      <h1 className="auth-heading">Create your account</h1>
      <p className="auth-sub">
        {justPurchased
          ? "Use the email from your Stripe receipt to access your purchase."
          : "Set up your 910 Academy account."}
      </p>
      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          Full name
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className="auth-input"
          />
        </label>
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
          <PasswordInput
            value={password}
            onChange={setPassword}
            required
            minLength={8}
            autoComplete="new-password"
            className="auth-input"
          />
          <MinLengthIndicator value={password} min={8} />
        </label>
        <label className="auth-label">
          Confirm password
          <PasswordInput
            value={confirm}
            onChange={setConfirm}
            required
            minLength={8}
            autoComplete="new-password"
            className="auth-input"
          />
          <MatchIndicator a={password} b={confirm} />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button
          type="submit"
          disabled={loading || !formValid}
          className="auth-btn"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
        <Link href="/account/login" className="auth-link">
          Already have an account? Sign in
        </Link>
      </form>
      <style>{`
        .auth-card { max-width: 440px; margin: 0 auto; padding: 48px 32px; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(255,255,255,0.02); }
        .auth-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); margin-bottom: 16px; text-align: center; }
        .auth-heading { font-size: 1.8rem; font-weight: 300; text-transform: uppercase; line-height: 1.1; text-align: center; margin-bottom: 8px; }
        .auth-sub { font-size: 0.95rem; color: var(--fg-muted); text-align: center; margin-bottom: 32px; line-height: 1.55; }
        .auth-form { display: flex; flex-direction: column; gap: 16px; }
        .auth-label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); }
        .auth-input { padding: 14px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: rgba(255,255,255,0.03); color: var(--fg); font-family: var(--font); font-size: 16px; }
        .auth-input:focus { outline: none; border-color: var(--accent); }
        .auth-btn { padding: 16px 24px; min-height: 48px; border-radius: var(--radius-sm); background: #FFF; color: #000; border: 1px solid #FFF; font-family: var(--font); font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; margin-top: 8px; }
        .auth-btn:hover:not(:disabled) { background: var(--accent); color: #FFF; border-color: var(--accent); }
        .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-error { font-size: 13px; color: #ff6b6b; padding: 12px 14px; border-radius: var(--radius-sm); background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.25); }
        .auth-link { display: block; text-align: center; font-size: 13px; color: var(--fg-muted); margin-top: 12px; }
        .auth-link:hover { color: var(--accent); }
      `}</style>
    </div>
  );
}
