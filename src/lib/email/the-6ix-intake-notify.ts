import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const TEMPLATE = readFileSync(
  path.join(process.cwd(), "emails/the-6ix-intake-notify.html"),
  "utf-8"
);

const ADMIN_EMAIL = "academy@studio910pb.com";

export type TicketType = "shooting" | "editing" | "both";

const TICKET_LABEL: Record<TicketType, string> = {
  shooting: "Shooting Day · Jun 5",
  editing: "Editing Day · Jun 6",
  both: "Both Days · Jun 5 + 6",
};

export type SendThe6ixIntakeNotifyParams = {
  ticketType: TicketType;
  companyName: string;
  fullName: string;
  phone: string;
  email: string;
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendThe6ixIntakeNotify(
  params: SendThe6ixIntakeNotifyParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const ticketLabel = TICKET_LABEL[params.ticketType];
  const html = TEMPLATE
    .replaceAll("{{companyName}}", escapeHtml(params.companyName))
    .replaceAll("{{fullName}}", escapeHtml(params.fullName))
    .replaceAll("{{email}}", escapeHtml(params.email))
    .replaceAll("{{phone}}", escapeHtml(params.phone))
    .replaceAll("{{ticketLabel}}", escapeHtml(ticketLabel))
    .replaceAll("{{submittedAt}}", escapeHtml(new Date().toISOString()));

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: ADMIN_EMAIL,
      replyTo: params.email,
      subject: `The 6ix intake (${ticketLabel}): ${params.fullName}`,
      html,
    });
    if (error) {
      console.error("[the-6ix-intake-notify] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[the-6ix-intake-notify] sent id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[the-6ix-intake-notify] threw:", message);
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
