import { Resend } from "resend";

// Inlined from emails/admin-grant-notify.html. Keeping this as a string avoids
// shipping a separate HTML file that has to be traced into the Vercel function
// bundle — the route group + dynamic-segment path of this server action made
// the outputFileTracingIncludes glob silently match nothing (digest 2952642615).
const TEMPLATE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>{{productName}} added to your library</title>
</head>

<body style="margin:0;padding:0;background-color:#f5f6f8;">

<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f5f6f8;opacity:0;">
{{productName}} is in your account.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
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
We have added a product to your library.
</div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;margin-top:8px;opacity:0.85;color:#ffffff;">
{{productName}}
</div>
</td>
</tr>

<tr>
<td style="padding:32px;">
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:15px;line-height:1.7;">

<p style="margin:0 0 16px 0;">
Hey {{firstName}},
</p>

<p style="margin:0 0 20px 0;">
We just added <strong>{{productName}}</strong> to your account. It is unlocked and ready to access from your library.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
<tr>
<td style="background-color:#0f172a;border-radius:10px;">
<a href="{{loginLink}}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.04em;">
Open your library &rarr;
</a>
</td>
</tr>
</table>

<p style="margin:0;font-size:14px;color:#64748b;">
Questions? Reply to this email and we will get back to you.
</p>

</div>
</td>
</tr>

<tr>
<td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.6;">
{{siteName}}
</div>
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;

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
