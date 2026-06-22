import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const REPLY_TO = "academy@studio910pb.com";
const SUBJECT = "You're in · AOC Live, July 11 · West Palm Beach";

// Loaded at module init. The template is bundled with the stripe-webhook route via
// outputFileTracingIncludes ("./emails/**/*.html") in next.config.ts.
const TEMPLATE = readFileSync(
  path.join(process.cwd(), "emails/aoc-live-confirmation.html"),
  "utf-8"
);

export type SendAocLiveConfirmParams = {
  to: string;
  fullName?: string | null;
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendAocLiveConfirm(
  params: SendAocLiveConfirmParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const firstName = (params.fullName ?? "").trim().split(/\s+/)[0] || "there";
  const html = TEMPLATE.replaceAll("{{firstName}}", escapeHtml(firstName));

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      replyTo: REPLY_TO,
      subject: SUBJECT,
      html,
    });
    if (error) {
      console.error("[aoc-live-confirm] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[aoc-live-confirm] sent confirm to ${params.to} id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[aoc-live-confirm] threw:", message);
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
