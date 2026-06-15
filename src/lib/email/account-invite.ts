import { Resend } from "resend";

// Inlined template — see admin-grant-notify.ts for why we inline rather than
// read an HTML file from disk (route-group server-action bundling).
const TEMPLATE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Your products are waiting</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f6f8;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f5f6f8;opacity:0;">
Your products are waiting — create your account to access them.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f6f8;">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:640px;background-color:#ffffff;border-radius:14px;overflow:hidden;">
<tr>
<td style="background-color:#0b0b0f;padding:28px 32px;">
<div style="font-family:Arial,Helvetica,sans-serif;letter-spacing:0.18em;font-size:11px;opacity:0.75;color:#ffffff;">
{{siteName}}
</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;margin-top:12px;line-height:1.25;color:#ffffff;">
Your products are waiting for you
</div>
</td>
</tr>
<tr>
<td style="padding:32px;">
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:15px;line-height:1.7;">
<p style="margin:0 0 16px 0;">Hey {{firstName}},</p>
<p style="margin:0 0 20px 0;">You've got {{productCountLabel}} ready in your library. Create your account to access {{themOrIt}}.</p>
{{productList}}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
<tr>
<td style="background-color:#0f172a;border-radius:10px;">
<a href="{{signupLink}}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.04em;">
Create your account &rarr;
</a>
</td>
</tr>
</table>
<p style="margin:0 0 8px 0;font-size:14px;color:#475569;">Use this email when you sign up so your library links up:</p>
<p style="margin:0 0 24px 0;font-family:'Courier New',monospace;background:#f8fafc;padding:10px 14px;border-radius:6px;border:1px solid #e5e7eb;font-size:14px;color:#0f172a;display:inline-block;">{{email}}</p>
<p style="margin:0;font-size:14px;color:#64748b;">Questions? Reply to this email and we will get back to you.</p>
</div>
</td>
</tr>
<tr>
<td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.6;">{{siteName}}</div>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

export type SendAccountInviteParams = {
  to: string;
  customerName: string | null;
  productTitles: string[];
  signupLink: string;
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

export async function sendAccountInvite(
  params: SendAccountInviteParams
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "910 Academy";
  const firstName =
    params.customerName?.trim().split(/\s+/)[0] || params.to.split("@")[0];

  const count = params.productTitles.length;
  const productCountLabel =
    count === 0 ? "your products" : count === 1 ? "1 product" : `${count} products`;
  const themOrIt = count === 1 ? "it" : "them";

  const html = TEMPLATE
    .replaceAll("{{siteName}}", escapeHtml(siteName))
    .replaceAll("{{firstName}}", escapeHtml(firstName))
    .replaceAll("{{productCountLabel}}", escapeHtml(productCountLabel))
    .replaceAll("{{themOrIt}}", themOrIt)
    .replaceAll("{{productList}}", buildProductList(params.productTitles))
    .replaceAll("{{email}}", escapeHtml(params.to))
    .replaceAll("{{signupLink}}", params.signupLink);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject: `Your products are waiting — create your ${siteName} account`,
      html,
    });
    if (error) {
      console.error("[account-invite] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) {
      return { success: false, error: "Resend returned no id" };
    }
    console.log(`[account-invite] sent to ${params.to} id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[account-invite] threw:", message);
    return { success: false, error: message };
  }
}

function buildProductList(titles: string[]): string {
  if (titles.length === 0) return "";
  const items = titles
    .map(
      (t) =>
        `<tr><td style="padding:10px 14px;border-bottom:1px solid #eef2f7;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;">${escapeHtml(
          t
        )}</td></tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">${items}</table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
