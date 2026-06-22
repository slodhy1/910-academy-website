#!/usr/bin/env node
/**
 * Send a SAMPLE AOC Live ticket confirmation to academy@studio910pb.com for review.
 *
 * Usage:
 *   node --env-file=.env.local scripts/send-aoc-live-confirm-sample.mjs [recipient]
 *
 * Renders emails/aoc-live-confirmation.html (filling {{firstName}}) and sends it via
 * Resend. Defaults to academy@studio910pb.com. No DB, no side effects beyond the send.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;
for (const [k, v] of Object.entries({ RESEND_API_KEY, EMAIL_FROM })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
}

const TO = process.argv[2] || "academy@studio910pb.com";
const SUBJECT = "[SAMPLE] Your AOC Live ticket is confirmed";
const TEMPLATE = "emails/aoc-live-confirmation.html";

const html = readFileSync(path.resolve(TEMPLATE), "utf-8").replaceAll("{{firstName}}", "there");

const resend = new Resend(RESEND_API_KEY);
console.log(`Sending sample AOC Live confirmation to ${TO} (from ${EMAIL_FROM})...`);
const { data, error } = await resend.emails.send({
  from: EMAIL_FROM,
  to: TO,
  replyTo: "academy@studio910pb.com",
  subject: SUBJECT,
  html,
});
if (error) { console.error("Resend error:", error); process.exit(1); }
console.log(`✓ sent id=${data?.id}`);
