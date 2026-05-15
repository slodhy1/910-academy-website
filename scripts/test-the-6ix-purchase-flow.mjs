#!/usr/bin/env node
/**
 * The 6ix purchase-flow smoke test.
 *
 * Simulates: someone submitted the intake form, then Stripe webhook fires.
 * Inserts a fresh row in the_6ix_intake, then directly runs the same
 * reconcile path the webhook uses, so you see both emails (team notify
 * + buyer confirmation) land in real inboxes without spending $910.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-the-6ix-purchase-flow.mjs <email> <shooting|editing|both>
 *
 * Example:
 *   node --env-file=.env.local scripts/test-the-6ix-purchase-flow.mjs you+test@yourdomain.com shooting
 *
 * The team email always goes to academy@studio910pb.com. The buyer email
 * goes to the <email> arg, so use an inbox you can read.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const [, , email, ticketTypeArg] = process.argv;
if (!email || !ticketTypeArg) {
  console.error("Usage: node scripts/test-the-6ix-purchase-flow.mjs <email> <shooting|editing|both>");
  process.exit(1);
}
const VALID = ["shooting", "editing", "both"];
if (!VALID.includes(ticketTypeArg)) {
  console.error(`ticket_type must be one of ${VALID.join(", ")}`);
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

for (const [k, v] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  RESEND_API_KEY,
  EMAIL_FROM,
})) {
  if (!v) {
    console.error(`Missing env var: ${k}`);
    process.exit(1);
  }
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TICKET_LABEL = {
  shooting: "Shooting Day · Jun 5",
  editing: "Editing Day · Jun 6",
  both: "Both Days · Jun 5 + 6",
};

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

const NOTIFY_TEMPLATE = readFileSync(path.resolve("emails/the-6ix-intake-notify.html"), "utf-8");

const normalized = email.toLowerCase();
const testRow = {
  ticket_type: ticketTypeArg,
  company_name: "Test Co (smoke test)",
  full_name: "Test Buyer",
  phone: "+15555550100",
  email: normalized,
};

console.log(`\n[1/4] Inserting fresh intake row for ${normalized}...`);
const { data: inserted, error: insertErr } = await sb
  .from("the_6ix_intake")
  .insert(testRow)
  .select("id")
  .single();
if (insertErr || !inserted) {
  console.error("Insert failed:", insertErr);
  process.exit(1);
}
console.log(`    inserted id=${inserted.id}`);

console.log(`\n[2/4] Reconciling (finding most recent unpurchased row, marking purchased)...`);
const { data: row, error: lookupErr } = await sb
  .from("the_6ix_intake")
  .select("id, ticket_type, company_name, full_name, phone, email")
  .eq("email", normalized)
  .is("purchased_at", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();
if (lookupErr || !row) {
  console.error("Lookup failed:", lookupErr);
  process.exit(1);
}
const { error: updateErr } = await sb
  .from("the_6ix_intake")
  .update({ purchased_at: new Date().toISOString() })
  .eq("id", row.id)
  .is("purchased_at", null);
if (updateErr) {
  console.error("Update failed:", updateErr);
  process.exit(1);
}
console.log(`    marked purchased: ${row.id}`);

const resend = new Resend(RESEND_API_KEY);
const ticketLabel = TICKET_LABEL[row.ticket_type];

console.log(`\n[3/4] Sending team notify to academy@studio910pb.com...`);
const notifyHtml = NOTIFY_TEMPLATE
  .replaceAll("{{companyName}}", esc(row.company_name))
  .replaceAll("{{fullName}}", esc(row.full_name))
  .replaceAll("{{email}}", esc(row.email))
  .replaceAll("{{phone}}", esc(row.phone))
  .replaceAll("{{ticketLabel}}", esc(ticketLabel))
  .replaceAll("{{submittedAt}}", esc(new Date().toISOString()));
const teamResult = await resend.emails.send({
  from: EMAIL_FROM,
  to: "academy@studio910pb.com",
  replyTo: row.email,
  subject: `[TEST] The 6ix sold (${ticketLabel}): ${row.full_name}`,
  html: notifyHtml,
});
if (teamResult.error) {
  console.error("    team email failed:", teamResult.error);
} else {
  console.log(`    team email sent id=${teamResult.data?.id}`);
}

console.log(`\n[4/4] Sending buyer confirmation to ${row.email}...`);
const confirmTemplate = readFileSync(path.resolve(TEMPLATE_FILE[row.ticket_type]), "utf-8");
const firstName = row.full_name.trim().split(/\s+/)[0] || row.full_name;
const confirmHtml = confirmTemplate.replaceAll("{{firstName}}", esc(firstName));
const buyerResult = await resend.emails.send({
  from: EMAIL_FROM,
  to: row.email,
  replyTo: "academy@studio910pb.com",
  subject: `[TEST] ${SUBJECT[row.ticket_type]}`,
  html: confirmHtml,
});
if (buyerResult.error) {
  console.error("    buyer email failed:", buyerResult.error);
} else {
  console.log(`    buyer email sent id=${buyerResult.data?.id}`);
}

console.log("\nDone. Check both inboxes.");
console.log(`To clean up the test row: delete from the_6ix_intake where id = '${row.id}';`);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
