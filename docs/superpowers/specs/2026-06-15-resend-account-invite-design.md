# Resend Account Link — Admin Customer Page

**Date:** 2026-06-15
**Status:** Approved, ready for implementation plan

## Problem

When a customer has purchased products (and has grants in `customer_products`)
but has not yet created a login, their admin record shows **Auth unlinked**.
Today the only way to nudge them to create an account is to run a one-off
script (`scripts/send-create-account-email.mjs`) from a terminal with
`TARGET_EMAIL` set. We want this to be a button in the admin UI on
`/admin/customers/[id]`.

## Goal

On the admin customer detail page, for customers who have not yet created a
login, show a **Resend account link** button that emails them an invitation to
create their account. The email tells them their products are waiting and links
them to the sign-up page (pre-filled with the correct email). Signing up
auto-links their existing grants via the existing middleware self-heal. The send
is recorded in the customer's Audit log.

## Decisions (locked)

- **Button visibility:** only when the customer is **Auth unlinked**
  (`customer.auth_user_id` is null). A linked customer already has a login.
- **Email content:** invite copy **plus a list of the customer's granted
  products**.
- **Audit logging:** yes — recorded in `admin_actions` like grants/revokes.
  Requires a small DB migration to allow a new `action_type`.

## Existing patterns this follows

- Email modules live in `src/lib/email/*.ts`, export a `sendX(...)` returning
  `SendResult = { success: true; id } | { success: false; error }`, read
  `RESEND_API_KEY` / `EMAIL_FROM`, and **inline** the HTML template as a string
  (see `src/lib/email/admin-grant-notify.ts` — a disk-file template silently
  failed to bundle into the route-group server-action function, digest
  2952642615). New module must inline the template too.
- Admin mutations are server actions in
  `src/app/admin/(authed)/customers/[id]/actions.ts`: `requireAdmin()` →
  do work → `logAdminAction(...)` → `revalidatePath(...)`. See
  `grantProductAction`.
- Client action buttons are small `"use client"` components using
  `useTransition` + `sonner` `toast`, with an `AlertDialog` confirm for
  destructive/outward actions. See `revoke-button.tsx`.
- DB migrations are numbered SQL files in `supabase/migrations/`, applied by a
  per-migration `scripts/apply-*.mjs` that uses `pg` + `SUPABASE_DB_URL`
  (see `scripts/apply-admin-actions-migration.mjs`). They are idempotent.
- `admin_actions.action_type` is constrained by a CHECK list (migration 0008)
  and mirrored by the `AuditActionType` TS union in `src/lib/admin/audit.ts`.
  Both must include any new action type.
- Account linking: a new auth user is matched to an existing `customers` row by
  email (sign-up action + `middleware.ts` self-heal). The invite must steer the
  customer to sign up with the **exact same email** as their customer record.

## The six pieces

### 1. New email module — `src/lib/email/account-invite.ts`

Mirrors `admin-grant-notify.ts` structure (inlined HTML template, `escapeHtml`,
`SendResult`).

```ts
sendAccountInvite({
  to: string,
  customerName: string | null,
  productTitles: string[],
  signupLink: string,
}): Promise<SendResult>
```

- **Subject:** `Your products are waiting — create your {siteName} account`
- **Headline:** "Your products are waiting for you"
- **Body:** `Hey {firstName}, you've got {N} products ready in your library.
  Create your account to access them.` → styled list of `productTitles` →
  CTA button **"Create your account →"** linking to `signupLink` → monospace
  note "Use this email when you sign up: `{to}`" → "Questions? Reply to this
  email."
- `firstName` derived as in `admin-grant-notify.ts`
  (`customerName` first token, else local-part of `to`).
- Singular/plural the product count ("1 product" vs "N products").
- If `productTitles` is empty, omit the list and use generic "your library"
  wording (defensive; the button is only shown for customers with grants in
  practice, but the module should not render an empty list).
- Branding identical to other emails (header `#0b0b0f`, CTA `#0f172a`,
  Arial, 640px table).

### 2. Sign-up email prefill — edit `src/app/account/(auth)/sign-up/page.tsx`

Seed the email field from the `email` query param:
`const [email, setEmail] = useState(params.get("email") ?? "")`.
No other behavior change. The field stays editable. This makes the invite link
one-click-correct so the email matches the customer record and the middleware
self-heal links the grants.

### 3. DB migration + apply script + TS union

- **`supabase/migrations/0011_admin_action_resend_invite.sql`** — idempotent
  drop/re-add of the `admin_actions_action_type_check` constraint, adding
  `'resend_account_invite'` to the existing list:

  ```sql
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

- **`scripts/apply-resend-invite-migration.mjs`** — modeled on
  `apply-admin-actions-migration.mjs` (`pg` + `SUPABASE_DB_URL`, reads the 0011
  file, runs it, prints the resulting constraint). Run once against prod.
- **`src/lib/admin/audit.ts`** — add `"resend_account_invite"` to the
  `AuditActionType` union.

### 4. Server action — add to `customers/[id]/actions.ts`

```ts
resendAccountInviteAction(customerId: string): Promise<ActionResult>
```

- `requireAdmin()`.
- Load customer (`id, email, full_name, auth_user_id`). Not found → error.
- Guard: if `auth_user_id` is set → `{ success: false, error: "Customer
  already has a linked account" }` (defensive; button is hidden in this case).
- Load granted product titles
  (`customer_products → products(title)` for this customer).
- Build `signupLink = ${NEXT_PUBLIC_SITE_URL || fallback}/account/sign-up?email=${encodeURIComponent(customer.email)}`.
- `sendAccountInvite(...)`.
- `logAdminAction(sb, { actionType: "resend_account_invite", customerId,
  metadata: { customer_email, product_count, email_id, email_error } })`.
- `revalidatePath(\`/admin/customers/${customerId}\`)`.
- **Return semantics:** unlike `grantProductAction` (which keeps the grant even
  if the email fails), this action's *only* effect is the email, so it returns
  `{ success: true, emailId }` only when the email actually sends, and
  `{ success: false, error }` when it does not. The audit row is written in both
  cases with `email_id`/`email_error`.

### 5. New client button — `customers/[id]/resend-invite-button.tsx`

Mirrors `revoke-button.tsx`: `AlertDialog` confirm ("Send account-creation email
to {email}?"), `useTransition`, `toast.success`/`toast.error`. Trigger is an
outline `Button` (e.g. `variant="outline" size="sm"`), label "Resend account
link".

### 6. Wire into page — edit `customers/[id]/page.tsx`

Render `<ResendInviteButton customerId={customer.id}
customerEmail={customer.email} />` in the header `Card`, near the Auth badge,
**only when `!customer.auth_user_id`**.

## Data flow

admin clicks button → confirm dialog → `resendAccountInviteAction` → loads
product titles + sends email via Resend + writes audit row → toast → page
revalidates → new entry visible in the Audit log card.

## Error handling

- Missing `RESEND_API_KEY`/`EMAIL_FROM` → email module returns error → action
  returns `{ success: false }` → `toast.error`.
- Already-linked customer → guarded in the action.
- Resend send failure → `toast.error`; audit row records `email_error`.

## Out of scope (YAGNI)

- Resend cooldown / rate limiting.
- An "invite sent" flag on the `customers` row (the Audit log covers this).
- Bulk / multi-customer resend.

## Verification

- `next build` / TypeScript passes (new action type in both the SQL CHECK and
  the TS union; no type errors).
- Apply the migration to prod (`scripts/apply-resend-invite-migration.mjs`).
- Manual test send to the admin's own email; confirm the email renders, the CTA
  link pre-fills the email field on the sign-up page, the toast reports success,
  and the Audit log shows a `resend_account_invite` entry.

## Files

New:
- `src/lib/email/account-invite.ts`
- `src/app/admin/(authed)/customers/[id]/resend-invite-button.tsx`
- `supabase/migrations/0011_admin_action_resend_invite.sql`
- `scripts/apply-resend-invite-migration.mjs`

Edited:
- `src/app/admin/(authed)/customers/[id]/actions.ts`
- `src/app/admin/(authed)/customers/[id]/page.tsx`
- `src/app/account/(auth)/sign-up/page.tsx`
- `src/lib/admin/audit.ts`
