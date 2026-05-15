import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";
import type { TicketType } from "./the-6ix-intake-notify";

const REPLY_TO = "academy@studio910pb.com";

const TEMPLATES: Record<TicketType, string> = {
  shooting: readFileSync(
    path.join(process.cwd(), "emails/iceman-shoot-confirmation.html"),
    "utf-8"
  ),
  editing: readFileSync(
    path.join(process.cwd(), "emails/iceman-edit-confirmation.html"),
    "utf-8"
  ),
  both: readFileSync(
    path.join(process.cwd(), "emails/iceman-bundle-confirmation.html"),
    "utf-8"
  ),
};

const SUBJECTS: Record<TicketType, string> = {
  shooting: "You're in the 6ix · The Shooting Day, June 5",
  editing: "You're in the 6ix · The Editing Day, June 6",
  both: "You're in the 6ix · The Full Weekend, June 5 + 6",
};

export type SendThe6ixConfirmParams = {
  to: string;
  fullName: string;
  ticketType: TicketType;
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendThe6ixConfirm(
  params: SendThe6ixConfirmParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const firstName = params.fullName.trim().split(/\s+/)[0] || params.fullName;
  const template = TEMPLATES[params.ticketType];
  const html = template.replaceAll("{{firstName}}", escapeHtml(firstName));

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      replyTo: REPLY_TO,
      subject: SUBJECTS[params.ticketType],
      html,
    });
    if (error) {
      console.error("[the-6ix-confirm] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(
      `[the-6ix-confirm] sent ${params.ticketType} confirm to ${params.to} id=${data.id}`
    );
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[the-6ix-confirm] threw:", message);
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
