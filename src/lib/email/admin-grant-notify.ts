import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const TEMPLATE = readFileSync(
  path.join(process.cwd(), "emails/admin-grant-notify.html"),
  "utf-8"
);

export type SendAdminGrantNotifyParams = {
  to: string;
  customerName: string | null;
  productName: string;
  loginLink: string;
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendAdminGrantNotify(
  params: SendAdminGrantNotifyParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Admin";
  const firstName =
    (params.customerName?.trim().split(/\s+/)[0]) || params.to.split("@")[0];

  const html = TEMPLATE
    .replaceAll("{{siteName}}", escapeHtml(siteName))
    .replaceAll("{{firstName}}", escapeHtml(firstName))
    .replaceAll("{{productName}}", escapeHtml(params.productName))
    .replaceAll("{{loginLink}}", params.loginLink);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `We have added ${params.productName} to your library`,
      html,
    });
    if (error) {
      console.error("[admin-grant-notify] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[admin-grant-notify] sent to ${params.to} id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[admin-grant-notify] threw:", message);
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
