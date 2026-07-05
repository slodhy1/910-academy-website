import { Resend } from "resend";

// Admin notification for the /aoc/livedemo demo-booking funnel. Fires on the first
// POST (routing decided) for every lead. Template is INLINED (no emails/*.html file),
// so no next.config.ts outputFileTracingIncludes entry is required for this route.
const ADMIN_EMAIL = "academy@studio910pb.com";

export type LivedemoNotifyParams = {
  q1: string;
  q2: string;
  q3: string; // comma-joined
  q4: string;
  fullName: string;
  email: string;
  phone: string;
  bucket: string; // LOW | MID | HIGH
  destination: string; // phone | team | existing
  outcome: string; // phone | booked
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

const DEST_LABEL: Record<string, string> = {
  phone: "Phone follow-up (Call List)",
  team: "Team demo Calendly (Booked Calls)",
  existing: "Existing Calendly (Booked Calls)",
};

export async function sendAocLivedemoNotify(p: LivedemoNotifyParams): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  // Subject makes triage instant in the inbox.
  const tag = p.outcome === "booked" ? "CALL" : "PHONE";
  const subject = `[AOC Demo] ${tag} · ${p.fullName.trim()} · ${p.phone.trim()}`.trim();

  const row = (label: string, val: string) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#666;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 0;color:#111;font-weight:600;">${escapeHtml(val)}</td></tr>`;

  const html =
    `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;"><tr><td align="center">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">` +
    `<tr><td style="background:#0a0a0a;padding:20px 28px;">` +
    `<span style="color:#38B6FF;font-weight:700;letter-spacing:.12em;font-size:12px;text-transform:uppercase;">Agent On Camera, Demo Funnel</span>` +
    `<div style="color:#fff;font-size:20px;font-weight:800;margin-top:6px;">${p.outcome === "booked" ? "New demo lead (booking)" : "New demo lead (call list)"}</div>` +
    `</td></tr>` +
    `<tr><td style="padding:24px 28px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.5;">` +
    row("Name", p.fullName) +
    row("Email", p.email) +
    row("Phone", p.phone) +
    row("Routed to", DEST_LABEL[p.destination] ?? p.destination) +
    `<tr><td colspan="2" style="border-top:1px solid #eee;padding-top:12px;"></td></tr>` +
    row("Q1 · Time in business", p.q1) +
    row("Q2 · Monthly earnings", `${p.q2} (${p.bucket})`) +
    row("Q3 · Focus areas", p.q3) +
    row("Q4 · Willing to invest", p.q4) +
    row("Submitted", new Date().toISOString()) +
    `</table></td></tr></table></td></tr></table></body></html>`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: ADMIN_EMAIL, subject, html });
    if (error) {
      console.error("[aoc-livedemo-notify] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[aoc-livedemo-notify] sent id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[aoc-livedemo-notify] threw:", message);
    return { success: false, error: message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
