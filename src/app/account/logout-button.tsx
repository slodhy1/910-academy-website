"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  async function onLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button onClick={onLogout} className="logout-btn" type="button">
      Sign out
      <style>{`
        .logout-btn { padding: 10px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: transparent; color: var(--fg-muted); font-family: var(--font); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
        .logout-btn:hover { color: var(--fg); border-color: var(--fg); }
      `}</style>
    </button>
  );
}
