# Resend Account Link Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Resend account link" button to the admin customer detail page that emails Auth-unlinked customers an invite to create their account (listing their products), and log the send in the Audit log.

**Architecture:** A new reusable Resend email module (`account-invite.ts`) is called by a new server action (`resendAccountInviteAction`) wired to a client confirm-button on `/admin/customers/[id]`. The sign-up page is taught to pre-fill its email from `?email=`. A one-line DB migration adds a new `admin_actions.action_type` so the send can be audited. Everything mirrors the existing grant/revoke flow.

**Tech Stack:** Next.js 15 (App Router, server actions), TypeScript, Supabase (service-role admin client + `pg` migration script), Resend, shadcn/ui (`AlertDialog`, `Button`), sonner toasts.

**Spec:** `docs/superpowers/specs/2026-06-15-resend-account-invite-design.md`

**Branch:** `feat/resend-account-invite` (already created; the spec commit is its first commit).

**No test framework note:** This repo has no vitest/jest/playwright and no test files. Per-task verification is `npx tsc --noEmit` (type safety) and the final task runs `npm run build`. The email send + linking flow is verified manually in the final task — it is an external integration (Resend + a live Supabase row) with no unit-test seam worth building for one button.

---

## File structure

New:
- `src/lib/email/account-invite.ts` — Resend email module, inlined HTML template.
- `src/app/admin/(authed)/customers/[id]/resend-invite-button.tsx` — client confirm button.
- `supabase/migrations/0011_admin_action_resend_invite.sql` — add `resend_account_invite` to the CHECK list.
- `scripts/apply-resend-invite-migration.mjs` — applies the 0011 migration to Supabase.

Modified:
- `src/lib/admin/audit.ts` — add `"resend_account_invite"` to `AuditActionType`.
- `src/app/admin/(authed)/customers/[id]/actions.ts` — add `resendAccountInviteAction`.
- `src/app/admin/(authed)/customers/[id]/page.tsx` — render the button when Auth unlinked.
- `src/app/account/(auth)/sign-up/page.tsx` — pre-fill email from `?email=`.

---

## Task 1: DB migration + apply script + audit type

**Files:**
- Create: `supabase/migrations/0011_admin_action_resend_invite.sql`
- Create: `scripts/apply-resend-invite-migration.mjs`
- Modify: `src/lib/admin/audit.ts`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0011_admin_action_resend_invite.sql`:

```sql
-- Add 'resend_account_invite' to the admin_actions.action_type CHECK list,
-- so resending the account-creation email can be recorded in the audit log.
-- Idempotent. Apply via scripts/apply-resend-invite-migration.mjs.

alter table public.admin_actions
  drop constraint if exists admin_actions_action_type_check;

alter table public.admin_actions
  add constraint admin_actions_action_type_check check (action_type in (
    'grant_product','revoke_product','update_customer',
    'create_product','update_product','delete_product',
    'update_application','create_lead','update_lead','add_lead_note',
    'resend_account_invite'
  ));
```

- [ ] **Step 2: Write the apply script**

Create `scripts/apply-resend-invite-migration.mjs`:

```js
#!/usr/bin/env node
/**
 * Add 'resend_account_invite' to admin_actions.action_type CHECK.
 *
 * Usage: node --env-file=.env.local scripts/apply-resend-invite-migration.mjs
 *
 * Requires SUPABASE_DB_URL in env (direct connection string, port 5432).
 * Idempotent: re-running is a no-op.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "SUPABASE_DB_URL not set. Grab it from Supabase → Project Settings → Database → Connection String → URI (direct, port 5432)."
  );
  process.exit(1);
}

const sqlPath = path.resolve(
  "supabase/migrations/0011_admin_action_resend_invite.sql"
);
const sql = readFileSync(sqlPath, "utf-8");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
console.log("✓ connected");

try {
  await client.query(sql);
  console.log(`✓ migration applied (${path.basename(sqlPath)})`);

  const { rows } = await client.query(
    `select pg_get_constraintdef(oid) as def
     from pg_constraint
     where conname = 'admin_actions_action_type_check'`
  );
  console.log("\nconstraint now:");
  for (const r of rows) console.log(`  ${r.def}`);
} finally {
  await client.end();
}
```

- [ ] **Step 3: Add the new action type to the TS union**

In `src/lib/admin/audit.ts`, extend `AuditActionType`. Replace:

```ts
export type AuditActionType =
  | "grant_product"
  | "revoke_product"
  | "update_customer"
  | "create_product"
  | "update_product"
  | "delete_product"
  | "update_application"
  | "create_lead"
  | "update_lead"
  | "add_lead_note";
```

with:

```ts
export type AuditActionType =
  | "grant_product"
  | "revoke_product"
  | "update_customer"
  | "create_product"
  | "update_product"
  | "delete_product"
  | "update_application"
  | "create_lead"
  | "update_lead"
  | "add_lead_note"
  | "resend_account_invite";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the union change is additive; nothing references it yet).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_admin_action_resend_invite.sql scripts/apply-resend-invite-migration.mjs src/lib/admin/audit.ts
git commit -m "feat(admin): add resend_account_invite audit action type + migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Email module `account-invite.ts`

**Files:**
- Create: `src/lib/email/account-invite.ts`

- [ ] **Step 1: Write the module**

Create `src/lib/email/account-invite.ts` (mirrors `admin-grant-notify.ts`; the
template is inlined — a disk-file template silently fails to bundle into the
route-group server-action function, see the note in `admin-grant-notify.ts`):

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/account-invite.ts
git commit -m "feat(email): account-invite email module (products-waiting invite)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Sign-up page email pre-fill

**Files:**
- Modify: `src/app/account/(auth)/sign-up/page.tsx`

- [ ] **Step 1: Seed the email field from `?email=`**

In `src/app/account/(auth)/sign-up/page.tsx`, the `SignUpForm` already has
`const params = useSearchParams();` (line ~24). Change the email state
initializer. Replace:

```tsx
  const [email, setEmail] = useState("");
```

with:

```tsx
  const [email, setEmail] = useState(params.get("email") ?? "");
```

(No other change. The field stays editable; `params` is already in scope.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/account/(auth)/sign-up/page.tsx"
git commit -m "feat(signup): pre-fill email field from ?email= query param

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Server action `resendAccountInviteAction`

**Files:**
- Modify: `src/app/admin/(authed)/customers/[id]/actions.ts`

- [ ] **Step 1: Add the import**

At the top of `src/app/admin/(authed)/customers/[id]/actions.ts`, below the
existing `sendAdminGrantNotify` import, add:

```ts
import { sendAccountInvite } from "@/lib/email/account-invite";
```

- [ ] **Step 2: Add the action**

Append to `src/app/admin/(authed)/customers/[id]/actions.ts`:

```ts
type GrantTitleRow = { product: { title: string } | null };

export async function resendAccountInviteAction(
  customerId: string
): Promise<ActionResult> {
  const adminUser = await requireAdmin();
  const sb = createAdminClient();

  const { data: customer, error: cErr } = await sb
    .from("customers")
    .select("id, email, full_name, auth_user_id")
    .eq("id", customerId)
    .maybeSingle();
  if (cErr || !customer) {
    return { success: false, error: "Customer not found" };
  }
  if (customer.auth_user_id) {
    return { success: false, error: "Customer already has a linked account" };
  }

  // Granted product titles for the email body.
  const { data: grantRows } = await sb
    .from("customer_products")
    .select("product:products(title)")
    .eq("customer_id", customerId);
  const productTitles = ((grantRows as unknown as GrantTitleRow[] | null) ?? [])
    .map((r) => r.product?.title)
    .filter((t): t is string => Boolean(t));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.910academy.com";
  const signupLink = `${siteUrl}/account/sign-up?email=${encodeURIComponent(
    customer.email
  )}`;

  const emailResult = await sendAccountInvite({
    to: customer.email,
    customerName: customer.full_name,
    productTitles,
    signupLink,
  });

  await logAdminAction(sb, {
    adminUserId: adminUser.id,
    adminEmail: adminUser.email!,
    actionType: "resend_account_invite",
    customerId,
    metadata: {
      customer_email: customer.email,
      product_count: productTitles.length,
      email_id: emailResult.success ? emailResult.id : null,
      email_error: emailResult.success ? null : emailResult.error,
    },
  });

  revalidatePath(`/admin/customers/${customerId}`);
  return emailResult.success
    ? { success: true, emailId: emailResult.id }
    : { success: false, error: emailResult.error };
}
```

Note: `customer.full_name` may be typed `string | null` from the row select; it
maps directly to `customerName: string | null`. The action returns
`{ success: false }` when the email fails (unlike `grantProductAction`) because
the email is this action's only effect — the spec's return semantics.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (If the Supabase select infers a stricter type for the
nested relation, the `as unknown as GrantTitleRow[]` cast — same pattern as
`page.tsx`'s `GrantRow` cast — keeps it sound.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(authed)/customers/[id]/actions.ts"
git commit -m "feat(admin): resendAccountInviteAction server action

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Client button component

**Files:**
- Create: `src/app/admin/(authed)/customers/[id]/resend-invite-button.tsx`

- [ ] **Step 1: Write the component** (mirrors `revoke-button.tsx`)

Create `src/app/admin/(authed)/customers/[id]/resend-invite-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { resendAccountInviteAction } from "./actions";

export function ResendInviteButton({
  customerId,
  customerEmail,
}: {
  customerId: string;
  customerEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const res = await resendAccountInviteAction(customerId);
      if (res.success) {
        toast.success(`Account link sent to ${customerEmail}`);
        setOpen(false);
      } else {
        toast.error(`Send failed: ${res.error}`);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        Resend account link
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send account-creation email?</AlertDialogTitle>
          <AlertDialogDescription>
            Email <strong>{customerEmail}</strong> a link to create their
            account. The link pre-fills this email so their existing products
            link up automatically when they sign up.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={pending}
          >
            {pending ? "Sending..." : "Send email"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/admin/(authed)/customers/[id]/resend-invite-button.tsx"
git commit -m "feat(admin): ResendInviteButton client component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Wire the button into the customer page

**Files:**
- Modify: `src/app/admin/(authed)/customers/[id]/page.tsx`

- [ ] **Step 1: Add the import**

In `src/app/admin/(authed)/customers/[id]/page.tsx`, below the existing
`import { GrantForm } from "./grant-form";` line, add:

```tsx
import { ResendInviteButton } from "./resend-invite-button";
```

- [ ] **Step 2: Render the button next to the Auth badge (unlinked only)**

In the header `Card`, replace this block:

```tsx
            <Badge variant={customer.auth_user_id ? "default" : "secondary"}>
              {customer.auth_user_id ? "Auth linked" : "Auth unlinked"}
            </Badge>
```

with:

```tsx
            <div className="flex flex-col items-end gap-2">
              <Badge variant={customer.auth_user_id ? "default" : "secondary"}>
                {customer.auth_user_id ? "Auth linked" : "Auth unlinked"}
              </Badge>
              {!customer.auth_user_id && (
                <ResendInviteButton
                  customerId={customer.id}
                  customerEmail={customer.email}
                />
              )}
            </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/(authed)/customers/[id]/page.tsx"
git commit -m "feat(admin): show Resend account link button for unlinked customers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Build gate + apply migration + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: build succeeds (this also runs the `prebuild` gated-pages check and
full type checking). Fix any errors before continuing.

- [ ] **Step 2: Apply the migration to Supabase**

This is a **production** DB change and needs `SUPABASE_DB_URL` (direct
connection string, port 5432). It is idempotent.

Run: `node --env-file=.env.local scripts/apply-resend-invite-migration.mjs`
Expected: prints `✓ migration applied` and the constraint def now including
`'resend_account_invite'`.

(If `SUPABASE_DB_URL` is not in `.env.local`, this step must be run by someone
who has it. Until applied, the audit-log insert for this action will fail
silently — `logAdminAction` logs the error but does not throw — and the email
still sends. The button is otherwise fully functional.)

- [ ] **Step 3: Manual end-to-end check**

  1. `npm run dev`, open `/admin/customers/<an Auth-unlinked customer>`.
  2. Confirm the **Resend account link** button shows under the "Auth
     unlinked" badge (and is absent on an Auth-linked customer).
  3. Click it → confirm dialog → Send email. Use a customer record whose email
     you control (or temporarily point at your own email).
  4. Expect a success toast. Check the inbox: subject "Your products are waiting
     — create your 910 Academy account", the product list renders, and the CTA
     link is `…/account/sign-up?email=<that email>`.
  5. Click the CTA → the sign-up email field is pre-filled with the right email.
  6. Reload the admin page → the Audit log shows a `resend_account_invite`
     entry (only if Step 2 was applied).

- [ ] **Step 4: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to decide how to
integrate (merge to `main` / open a PR) once verification passes.

---

## Self-review

- **Spec coverage:** email module (Task 2), sign-up pre-fill (Task 3), migration
  + apply script + TS union (Task 1), server action (Task 4), client button
  (Task 5), page wiring unlinked-only (Task 6), build + migration apply + manual
  verification (Task 7). All six spec pieces + verification covered.
- **Placeholder scan:** no TBD/TODO; every code step shows full code.
- **Type consistency:** `sendAccountInvite` / `SendAccountInviteParams`
  (`to`, `customerName: string | null`, `productTitles: string[]`,
  `signupLink`) defined in Task 2 and called identically in Task 4;
  `resendAccountInviteAction(customerId): Promise<ActionResult>` defined in
  Task 4 and called identically in Task 5; `ResendInviteButton`
  (`customerId`, `customerEmail`) defined in Task 5 and rendered identically in
  Task 6; `"resend_account_invite"` identical across the SQL CHECK (Task 1),
  the `AuditActionType` union (Task 1), and the action's `actionType` (Task 4).
