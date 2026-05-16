#!/usr/bin/env node
/**
 * Manually re-fire the buyer confirmation email for The 6ix.
 *
 * Usage:
 *   node --env-file=.env.local scripts/resend-the-6ix-confirm.mjs <email>
 *
 * Looks up the most recent purchased row in the_6ix_intake for that
 * email, picks the matching iceman-{shoot|edit|bundle}-confirmation
 * template, and sends through Resend. Does NOT touch the team notify.
 *
 * Use when a buyer says they didn't get their confirmation.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const [, , emailArg] = process.argv;
if (!emailArg) {
  console.error("Usage: node scripts/resend-the-6ix-confirm.mjs <email>");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEMPLATE_FILE = {
  shooting: "emails/iceman-shoot-confirmation.html",
  editing: "emails/iceman-edit-confirmation.html",
  both: "emails/iceman-bundle-confirmation.html",
};
const SUBJECT = {
  shooting: "You're in the 6ix · The Shooting Day, June 5",
  editing: "You're in the 6ix · The Editing Day, June 6",
  both: "You're in the 6ix · The Full Weekend, June 5 + 6",
};

const normalized = emailArg.toLowerCase();
console.log(`\nLooking up most recent purchased row for ${normalized}...`);

const { data: rows, error } = await sb
  .from("the_6ix_intake")
  .select("id, ticket_type, full_name, email, purchased_at, created_at")
  .eq("email", normalized)
  .order("created_at", { ascending: false })
  .limit(5);
if (error) { console.error("Supabase lookup failed:", error); process.exit(1); }
if (!rows || rows.length === 0) {
  console.error(`No intake row found for ${normalized}. Check the address.`);
  process.exit(1);
}

console.log(`Found ${rows.length} row(s):`);
for (const r of rows) {
  console.log(`  ${r.id}  ${r.ticket_type.padEnd(8)}  ${r.full_name.padEnd(24)}  ${r.purchased_at ? "PAID " + r.purchased_at : "unpaid"}`);
}

const target = rows.find((r) => r.purchased_at) || rows[0];
if (!target.purchased_at) {
  console.log(`\nNote: no PAID row exists. Sending against unpaid row anyway since you asked.`);
}

const resend = new Resend(RESEND_API_KEY);
const template = readFileSync(path.resolve(TEMPLATE_FILE[target.ticket_type]), "utf-8");
const firstName = target.full_name.trim().split(/\s+/)[0] || target.full_name;
const html = template.replaceAll("{{firstName}}", escapeHtml(firstName));

console.log(`\nSending ${target.ticket_type} confirmation to ${target.email}...`);
const { data: sent, error: sendErr } = await resend.emails.send({
  from: EMAIL_FROM,
  to: target.email,
  replyTo: "academy@studio910pb.com",
  subject: SUBJECT[target.ticket_type],
  html,
});
if (sendErr) { console.error("Resend error:", sendErr); process.exit(1); }
console.log(`✓ sent id=${sent?.id}`);

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
