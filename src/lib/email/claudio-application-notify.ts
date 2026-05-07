import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

const TEMPLATE = readFileSync(
  path.join(process.cwd(), "emails/claudio-application-notify.html"),
  "utf-8"
);

const ADMIN_EMAIL = "academy@studio910pb.com";

export type SendClaudioApplicationNotifyParams = {
  name: string;
  email: string;
  businessName: string | null;
  portfolioUrl: string | null;
  helpType: string;
  budgetRange: string;
  goal: string;
  additionalNotes: string | null;
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendClaudioApplicationNotify(
  params: SendClaudioApplicationNotifyParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const html = TEMPLATE
    .replaceAll("{{name}}", escapeHtml(params.name))
    .replaceAll("{{email}}", escapeHtml(params.email))
    .replaceAll("{{businessName}}", escapeHtml(params.businessName ?? "(not provided)"))
    .replaceAll("{{portfolioUrl}}", escapeHtml(params.portfolioUrl ?? "(not provided)"))
    .replaceAll("{{helpType}}", escapeHtml(params.helpType))
    .replaceAll("{{budgetRange}}", escapeHtml(params.budgetRange))
    .replaceAll("{{goal}}", escapeMultiline(params.goal))
    .replaceAll("{{additionalNotes}}", escapeMultiline(params.additionalNotes ?? "(none)"))
    .replaceAll("{{submittedAt}}", escapeHtml(new Date().toISOString()));

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: ADMIN_EMAIL,
      replyTo: params.email,
      subject: `New 1:1 application from ${params.name}`,
      html,
    });
    if (error) {
      console.error("[claudio-application-notify] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[claudio-application-notify] sent id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[claudio-application-notify] threw:", message);
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

function escapeMultiline(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}
