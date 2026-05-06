import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const TEMPLATE = readFileSync(
  path.join(process.cwd(), "emails/welcome-email.html"),
  "utf-8"
);

const LOGIN_LINK = "https://www.910academy.com/account/login";

export type SendWelcomeEmailParams = {
  to: string;
  productName: string;
  tempPassword: string;
};

export type SendWelcomeEmailResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendWelcomeEmail(
  params: SendWelcomeEmailParams
): Promise<SendWelcomeEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const html = TEMPLATE.replaceAll("{{productName}}", escapeHtml(params.productName))
    .replaceAll("{{email}}", escapeHtml(params.to))
    .replaceAll("{{tempPassword}}", escapeHtml(params.tempPassword))
    .replaceAll("{{loginLink}}", LOGIN_LINK);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: "Your 910 Academy account is ready",
      html,
    });
    if (error) {
      console.error("[welcome-email] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[welcome-email] sent to ${params.to} id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[welcome-email] threw:", message);
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
