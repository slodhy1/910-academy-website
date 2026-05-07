import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/**
 * Server-side admin guard. Use in admin layouts, pages, server actions, route
 * handlers. Defense in depth alongside the middleware: cookies can race, env
 * can change, and middleware never runs for some edge cases. Always re-check.
 *
 * Throws Next 15 redirect() if the user is not signed in or not in the
 * ADMIN_EMAILS allowlist. Returns the verified User on success.
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/admin/login");
  }
  if (!isAdminEmail(user.email)) {
    redirect("/account");
  }
  return user;
}

export function getSiteName(): string {
  return process.env.NEXT_PUBLIC_SITE_NAME || "Admin";
}
