import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const REPLY_TO = "academy@studio910pb.com";
const SUBJECT = "You're in! The 3 Levels of Real Estate Media Mastery";

// Loaded at module init. The template is bundled with the /api/aoc-event/register
// route via outputFileTracingIncludes ("./emails/**/*.html") in next.config.ts.
const TEMPLATE = readFileSync(
  path.join(process.cwd(), "emails/levels-confirmation.html"),
  "utf-8"
);

export type SendLevelsConfirmParams = {
  to: string;
  firstName?: string | null;
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendLevelsConfirm(
  params: SendLevelsConfirmParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const firstName = (params.firstName ?? "").trim().split(/\s+/)[0] || "there";
  const html = TEMPLATE.replaceAll("{{firstName}}", escapeHtml(firstName));

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      replyTo: REPLY_TO,
      subject: SUBJECT,
      html,
      // Native "unsubscribe" in Gmail/Apple Mail -> emails the team, who removes them
      // from the list manually (matches the footer unsubscribe link).
      headers: { "List-Unsubscribe": "<mailto:academy@studio910pb.com?subject=Unsubscribe>" },
    });
    if (error) {
      console.error("[levels-confirm] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[levels-confirm] sent confirm to ${params.to} id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[levels-confirm] threw:", message);
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
