"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PasswordInput,
  MinLengthIndicator,
  MatchIndicator,
} from "@/components/PasswordInput";

type Toast = { kind: "success" | "error" | "info"; text: string } | null;

export function SettingsForms({
  initialFullName,
  initialEmail,
}: {
  initialFullName: string;
  initialEmail: string;
}) {
  const router = useRouter();

  const [fullName, setFullName] = useState(initialFullName);
  const [nameToast, setNameToast] = useState<Toast>(null);
  const [nameLoading, setNameLoading] = useState(false);

  const [email, setEmail] = useState(initialEmail);
  const [emailToast, setEmailToast] = useState<Toast>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwToast, setPwToast] = useState<Toast>(null);
  const [pwLoading, setPwLoading] = useState(false);

  async function onSubmitName(e: React.FormEvent) {
    e.preventDefault();
    setNameToast(null);
    setNameLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });
    setNameLoading(false);
    if (error) {
      setNameToast({ kind: "error", text: error.message });
    } else {
      setNameToast({ kind: "success", text: "Name updated." });
      router.refresh();
    }
  }

  async function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailToast(null);
    if (email.trim() === initialEmail) {
      setEmailToast({ kind: "info", text: "Email unchanged." });
      return;
    }
    setEmailLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setEmailLoading(false);
    if (error) {
      setEmailToast({ kind: "error", text: error.message });
    } else {
      setEmailToast({
        kind: "info",
        text: `Confirmation sent to ${email.trim()}. Click the link there to complete the change.`,
      });
    }
  }

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwToast(null);
    if (newPassword.length < 8) {
      setPwToast({
        kind: "error",
        text: "New password must be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwToast({ kind: "error", text: "New passwords don't match." });
      return;
    }
    setPwLoading(true);
    const supabase = createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: initialEmail,
      password: currentPassword,
    });
    if (signInErr) {
      setPwToast({ kind: "error", text: "Current password incorrect." });
      setPwLoading(false);
      return;
    }
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setPwLoading(false);
    if (updateErr) {
      setPwToast({ kind: "error", text: updateErr.message });
      return;
    }
    setPwToast({ kind: "success", text: "Password updated." });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="settings-grid">
      <Section title="Full name">
        <form onSubmit={onSubmitName} className="settings-form">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className="settings-input"
          />
          <ToastView toast={nameToast} />
          <button type="submit" disabled={nameLoading} className="settings-btn">
            {nameLoading ? "Saving..." : "Save name"}
          </button>
        </form>
      </Section>

      <Section title="Email address">
        <form onSubmit={onSubmitEmail} className="settings-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="settings-input"
          />
          <ToastView toast={emailToast} />
          <button
            type="submit"
            disabled={emailLoading}
            className="settings-btn"
          >
            {emailLoading ? "Sending..." : "Update email"}
          </button>
          <p className="settings-help">
            A confirmation link will be sent to the new address. The change
            takes effect after you click that link.
          </p>
        </form>
      </Section>

      <Section title="Change password">
        <form onSubmit={onSubmitPassword} className="settings-form">
          <label className="settings-label">
            Current password
            <PasswordInput
              value={currentPassword}
              onChange={setCurrentPassword}
              required
              autoComplete="current-password"
              className="settings-input"
            />
          </label>
          <label className="settings-label">
            New password
            <PasswordInput
              value={newPassword}
              onChange={setNewPassword}
              required
              minLength={8}
              autoComplete="new-password"
              className="settings-input"
            />
            <MinLengthIndicator value={newPassword} min={8} />
          </label>
          <label className="settings-label">
            Confirm new password
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              minLength={8}
              autoComplete="new-password"
              className="settings-input"
            />
            <MatchIndicator a={newPassword} b={confirmPassword} />
          </label>
          <ToastView toast={pwToast} />
          <button type="submit" disabled={pwLoading} className="settings-btn">
            {pwLoading ? "Updating..." : "Change password"}
          </button>
        </form>
      </Section>

      <style>{`
        .settings-grid { display: flex; flex-direction: column; gap: 32px; }
        .settings-section { padding: 32px; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 16px; }
        .settings-section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: var(--fg-muted); margin-bottom: 4px; }
        .settings-form { display: flex; flex-direction: column; gap: 12px; max-width: 480px; }
        .settings-label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); }
        .settings-input { padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: rgba(255,255,255,0.03); color: var(--fg); font-family: var(--font); font-size: 15px; }
        .settings-input:focus { outline: none; border-color: var(--accent); }
        .settings-btn { align-self: flex-start; padding: 12px 22px; border-radius: var(--radius-sm); background: #FFF; color: #000; border: 1px solid #FFF; font-family: var(--font); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
        .settings-btn:hover:not(:disabled) { background: var(--accent); color: #FFF; border-color: var(--accent); }
        .settings-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .settings-help { font-size: 12px; color: var(--fg-muted); line-height: 1.5; }
        .settings-toast { font-size: 13px; padding: 10px 14px; border-radius: var(--radius-sm); }
        .settings-toast-success { background: rgba(56,182,255,0.08); border: 1px solid var(--accent-border-subtle); color: var(--fg); }
        .settings-toast-error { background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.25); color: #ff6b6b; }
        .settings-toast-info { background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--fg-muted); }
      `}</style>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section">
      <h2 className="settings-section-title">{title}</h2>
      {children}
    </section>
  );
}

function ToastView({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return <p className={`settings-toast settings-toast-${toast.kind}`}>{toast.text}</p>;
}
