import { readFileSync } from "node:fs";
import path from "node:path";
import { Resend } from "resend";

// Bundled with the stripe-webhook route via outputFileTracingIncludes in next.config.ts.
const TEMPLATE = readFileSync(
  path.join(process.cwd(), "emails/aoc-live-intake-notify.html"),
  "utf-8"
);

const ADMIN_EMAIL = "academy@studio910pb.com";

export type SendAocLiveIntakeNotifyParams = {
  fullName: string;
  email: string;
  phone: string;
  amountCents?: number | null;
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendAocLiveIntakeNotify(
  params: SendAocLiveIntakeNotifyParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const amount =
    typeof params.amountCents === "number"
      ? `$${(params.amountCents / 100).toFixed(2)}`
      : "—";
  const html = TEMPLATE
    .replaceAll("{{fullName}}", escapeHtml(params.fullName || "—"))
    .replaceAll("{{email}}", escapeHtml(params.email))
    .replaceAll("{{phone}}", escapeHtml(params.phone || "— (not captured)"))
    .replaceAll("{{amount}}", escapeHtml(amount))
    .replaceAll("{{submittedAt}}", escapeHtml(new Date().toISOString()));

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: ADMIN_EMAIL,
      replyTo: params.email,
      subject: `AOC Live ticket sold: ${params.fullName || params.email}`,
      html,
    });
    if (error) {
      console.error("[aoc-live-intake-notify] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[aoc-live-intake-notify] sent id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[aoc-live-intake-notify] threw:", message);
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
