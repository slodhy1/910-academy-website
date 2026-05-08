#!/usr/bin/env node
/**
 * Phase G4: seed/reset an admin auth user with a known password.
 *
 * Bypasses Supabase SMTP (which is not configured for password reset emails)
 * by using the admin API to set the password directly. Used to bootstrap
 * admin access for productization across multiple clients.
 *
 * Usage:
 *   ADMIN_SEED_EMAIL=admin@example.com \
 *   ADMIN_SEED_PASSWORD=my-strong-password \
 *     node --env-file=.env.local scripts/seed-admin-user.mjs
 *
 * Env (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Behaviour:
 *   - If a user with this email already exists, resets the password.
 *   - Otherwise creates the user with email already confirmed.
 *   - Idempotent: re-running with the same env vars is a safe no-op
 *     beyond the password reset.
 *
 * NOTE: This does not touch ADMIN_EMAILS. Allowlist gating is enforced
 * separately by middleware + requireAdmin(). Creating an auth user does
 * not grant admin access on its own. The email must also appear in
 * ADMIN_EMAILS for /admin/* routes to authorize.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_SEED_EMAIL;
const password = process.env.ADMIN_SEED_PASSWORD;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from env."
  );
  process.exit(1);
}
if (!email) {
  console.error("ADMIN_SEED_EMAIL missing. Set in shell before running.");
  process.exit(1);
}
if (!password) {
  console.error("ADMIN_SEED_PASSWORD missing. Set in shell before running.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("ADMIN_SEED_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const emailLower = email.trim().toLowerCase();

// listUsers paginates up to 1000 per page; iterate until we find or exhaust.
let page = 1;
let existing = null;
while (true) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }
  const found = (data?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === emailLower
  );
  if (found) {
    existing = found;
    break;
  }
  if (!data || data.users.length < 1000) break;
  page += 1;
}

if (existing) {
  const { error } = await sb.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("updateUserById failed:", error.message);
    process.exit(1);
  }
  console.log(`reset password for existing user`);
  console.log(`  id:    ${existing.id}`);
  console.log(`  email: ${existing.email}`);
} else {
  const { data, error } = await sb.auth.admin.createUser({
    email: emailLower,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) {
    console.error("createUser failed:", error?.message);
    process.exit(1);
  }
  console.log(`created new user`);
  console.log(`  id:    ${data.user.id}`);
  console.log(`  email: ${data.user.email}`);
}

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (adminEmails.length === 0) {
  console.warn(
    "\nWARNING: ADMIN_EMAILS is not set in this shell. The user can sign in but middleware will bounce them off /admin until that var is configured (locally + Vercel)."
  );
} else if (!adminEmails.includes(emailLower)) {
  console.warn(
    `\nWARNING: ${emailLower} is NOT in ADMIN_EMAILS allowlist (${adminEmails.join(", ")}). Sign-in will succeed but /admin routes will redirect to /account.`
  );
} else {
  console.log(
    `\n${emailLower} is in ADMIN_EMAILS allowlist. Sign in at /admin/login, dashboard is at /admin/customers.`
  );
}
