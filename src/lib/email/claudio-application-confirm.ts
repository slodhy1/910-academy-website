import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const TEMPLATE = readFileSync(
  path.join(process.cwd(), "emails/claudio-application-confirm.html"),
  "utf-8"
);

const REPLY_TO = "academy@studio910pb.com";

export type SendClaudioApplicationConfirmParams = {
  to: string;
  name: string;
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendClaudioApplicationConfirm(
  params: SendClaudioApplicationConfirmParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const firstName = params.name.trim().split(/\s+/)[0] || params.name;
  const html = TEMPLATE
    .replaceAll("{{firstName}}", escapeHtml(firstName));

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      replyTo: REPLY_TO,
      subject: "We received your application",
      html,
    });
    if (error) {
      console.error("[claudio-application-confirm] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[claudio-application-confirm] sent to ${params.to} id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[claudio-application-confirm] threw:", message);
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
