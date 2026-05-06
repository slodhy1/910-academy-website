import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const TEMPLATE = readFileSync(
  path.join(process.cwd(), "emails/purchase-confirmed.html"),
  "utf-8"
);

export type SendPurchaseConfirmedParams = {
  to: string;
  productName: string;
  accessLink: string;
};

export type SendPurchaseConfirmedResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendPurchaseConfirmedEmail(
  params: SendPurchaseConfirmedParams
): Promise<SendPurchaseConfirmedResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const html = TEMPLATE.replaceAll(
    "{{productName}}",
    escapeHtml(params.productName)
  ).replaceAll("{{accessLink}}", params.accessLink);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `Purchase confirmed — ${params.productName}`,
      html,
    });
    if (error) {
      console.error("[purchase-confirmed] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[purchase-confirmed] sent to ${params.to} id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[purchase-confirmed] threw:", message);
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
