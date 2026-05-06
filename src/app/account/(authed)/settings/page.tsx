import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SettingsForms } from "./forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/account/login");

  const fullName =
    (typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name) ||
    "";
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="settings">
      <header className="settings-head">
        <div>
          <Link href="/account" className="settings-back">
            ← Back to your account
          </Link>
          <p className="settings-eyebrow">SETTINGS</p>
          <h1 className="settings-heading">Account</h1>
          {memberSince && (
            <p className="settings-meta">Member since {memberSince}</p>
          )}
        </div>
      </header>

      <SettingsForms
        initialFullName={fullName}
        initialEmail={user.email ?? ""}
      />

      <style>{`
        .settings { display: flex; flex-direction: column; gap: 40px; }
        .settings-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
        .settings-back { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); transition: color 0.2s; margin-bottom: 8px; display: inline-block; }
        .settings-back:hover { color: var(--accent); }
        .settings-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); margin-top: 12px; }
        .settings-heading { font-size: clamp(1.6rem, 3.5vw, 2.4rem); font-weight: 300; text-transform: uppercase; line-height: 1.1; }
        .settings-meta { font-size: 13px; color: var(--fg-muted); margin-top: 8px; }
      `}</style>
    </div>
  );
}
