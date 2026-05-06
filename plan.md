# Phase B v2 plan — webhook rework + customer signup + new email

Diff-level precision. No file outside this list will be touched.

## Schema migration: NONE.

The `customers` table already has `auth_user_id uuid references auth.users(id) on delete set null` and `email text not null unique`. Email-based linkage works as-is. No DDL.

---

## File 1 — `src/lib/email/purchase-confirmed.ts` (new — replaces `welcome.ts`)

```ts
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

  const html = TEMPLATE.replaceAll("{{productName}}", escapeHtml(params.productName))
    .replaceAll("{{accessLink}}", params.accessLink);
  // accessLink is a URL we control (always /account?purchase=success); no escape.

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
```

## File 2 — `src/lib/email/welcome.ts` — **delete**

After File 1 is created and File 3's import is swapped, delete the old file with `git rm`.

---

## File 3 — `src/lib/webhook/process-checkout.ts` (rewrite)

New flow: upsert customer (no auth user creation), link to existing auth user if any, upsert grant, send purchase-confirmed email.

```ts
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPurchaseConfirmedEmail } from "@/lib/email/purchase-confirmed";

const ACCESS_LINK = "https://www.910academy.com/account?purchase=success";

export type ProcessResult = {
  success: boolean;
  customerId?: string;
  wasNewCustomer?: boolean;
  error?: string;
  emailResult?: { success: boolean; error?: string };
};

export async function processCheckoutCompleted(
  event: Stripe.Event
): Promise<ProcessResult> {
  if (event.type !== "checkout.session.completed") {
    return { success: true };
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const email = session.customer_details?.email || session.customer_email;
  if (!email) {
    console.warn(
      "[stripe-webhook] checkout.session.completed without customer email",
      session.id
    );
    return { success: true };
  }

  const supabase = createAdminClient();

  // Resolve product slug. Metadata first, then payment_link lookup.
  let productSlug: string | undefined = session.metadata?.product_slug;

  if (!productSlug && session.payment_link) {
    const linkId =
      typeof session.payment_link === "string"
        ? session.payment_link
        : session.payment_link.id;
    console.log(`Webhook: matching payment_link ${linkId}`);
    const { data: p, error } = await supabase
      .from("products")
      .select("slug")
      .eq("stripe_payment_link_id", linkId)
      .maybeSingle();

    if (error) console.error("Product lookup error:", error);
    if (p) productSlug = p.slug;
  }

  if (!productSlug) {
    console.error(
      `Webhook: no product matched for session ${session.id}, payment_link=${session.payment_link}, metadata=`,
      session.metadata
    );
    return { success: true };
  }

  console.log(`Webhook: granting access for ${productSlug} to ${email}`);

  const { data: product } = await supabase
    .from("products")
    .select("id, title")
    .eq("slug", productSlug)
    .single();
  if (!product) {
    console.warn("[stripe-webhook] product row missing for slug", productSlug);
    return { success: true };
  }

  // Find existing customer
  const { data: existing } = await supabase
    .from("customers")
    .select("id, auth_user_id")
    .eq("email", email)
    .maybeSingle();

  let customerId: string;
  let wasNewCustomer = false;

  if (existing) {
    customerId = existing.id;

    // If the customers row has no auth_user_id but an auth user exists for
    // this email (signup-before-payment case), link them.
    if (!existing.auth_user_id) {
      const matchedAuthId = await findAuthUserIdByEmail(supabase, email);
      if (matchedAuthId) {
        const { error: linkErr } = await supabase
          .from("customers")
          .update({ auth_user_id: matchedAuthId })
          .eq("id", customerId);
        if (linkErr) {
          console.error("[stripe-webhook] failed to link auth user:", linkErr);
        } else {
          console.log(
            `[stripe-webhook] linked existing auth user ${matchedAuthId} to customer ${customerId}`
          );
        }
      }
    }
  } else {
    wasNewCustomer = true;

    // Customer paying for the first time. They may or may not have an auth
    // account already — link if they do, otherwise leave null until they
    // sign up via /account/sign-up.
    const matchedAuthId = await findAuthUserIdByEmail(supabase, email);

    const stripeCustomerId =
      typeof session.customer === "string" ? session.customer : null;
    const { data: newCustomer, error: insertErr } = await supabase
      .from("customers")
      .insert({
        email,
        auth_user_id: matchedAuthId ?? null,
        stripe_customer_id: stripeCustomerId,
        full_name: session.customer_details?.name || null,
      })
      .select("id")
      .single();
    if (insertErr || !newCustomer) {
      console.error("[stripe-webhook] customer row insert failed:", insertErr);
      return { success: false, error: "Customer insert failed" };
    }
    customerId = newCustomer.id;
    console.log(
      `[stripe-webhook] new customer: ${email}${
        matchedAuthId ? " (linked to existing auth user)" : " (no auth account yet)"
      }`
    );
  }

  const { error: cpErr } = await supabase
    .from("customer_products")
    .upsert(
      {
        customer_id: customerId,
        product_id: product.id,
        stripe_session_id: session.id,
        amount_paid_cents: session.amount_total ?? null,
      },
      { onConflict: "customer_id,product_id" }
    );
  if (cpErr) {
    console.error("[stripe-webhook] customer_products upsert failed:", cpErr);
    return { success: false, error: "Grant insert failed" };
  }

  // Send purchase-confirmed email on every successful grant — the email is
  // a receipt + access link, not a welcome. Returning customers buying a
  // second product still need confirmation that the transaction landed and
  // where to access it.
  let emailResult: ProcessResult["emailResult"];
  const sendResult = await sendPurchaseConfirmedEmail({
    to: email,
    productName: product.title,
    accessLink: ACCESS_LINK,
  });
  emailResult = sendResult.success
    ? { success: true }
    : { success: false, error: sendResult.error };
  if (!sendResult.success) {
    console.error(
      "[stripe-webhook] purchase email failed (continuing):",
      sendResult.error
    );
  }

  return { success: true, customerId, wasNewCustomer, emailResult };
}

async function findAuthUserIdByEmail(
  supabase: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string | undefined> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) {
    console.error("[stripe-webhook] auth list failed:", error);
    return undefined;
  }
  return data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )?.id;
}
```

**Behavioural deltas vs current:**
- No `auth.admin.createUser` call. No temp password.
- No `wasNewUser`; replaced with `wasNewCustomer` (true when we just inserted the customers row). Reported in ProcessResult for observability; not used to gate email.
- Email fires on every successful grant (every `customer_products` upsert that didn't error). Repeat customers buying a second product still get a receipt + access link.
- `findAuthUserIdByEmail` called on both branches (existing+orphan-link, new+best-effort-link).
- `process-checkout.ts` no longer imports `node:crypto`.

---

## File 4 — `src/app/account/sign-up/page.tsx` (new)

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { linkCustomerToAuthUser } from "./actions";

export default function SignUpPage() {
  const router = useRouter();
  const params = useSearchParams();
  const justPurchased = params.get("purchase") === "success";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });

    if (signUpErr) {
      setError(signUpErr.message);
      setLoading(false);
      return;
    }

    // Server action — link the existing customers row (if any) to this auth user.
    if (data.user) {
      try {
        await linkCustomerToAuthUser(email.trim(), data.user.id, fullName.trim());
      } catch (e) {
        console.error("link error", e);
      }
    }

    if (data.session) {
      router.push("/account");
      router.refresh();
      return;
    }

    // No session means email confirmation is required.
    setInfo(
      "Check your email to confirm your account. Once confirmed, sign in to access your products."
    );
    setLoading(false);
  }

  return (
    <div className="auth-card">
      <p className="auth-eyebrow">910 ACADEMY</p>
      <h1 className="auth-heading">Create your account</h1>
      <p className="auth-sub">
        {justPurchased
          ? "Use the email from your Stripe receipt to access your purchase."
          : "Set up your 910 Academy account."}
      </p>
      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          Full name
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className="auth-input"
          />
        </label>
        <label className="auth-label">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="auth-input"
          />
        </label>
        <label className="auth-label">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="auth-input"
          />
        </label>
        <label className="auth-label">
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="auth-input"
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        {info && <p className="auth-info">{info}</p>}
        <button type="submit" disabled={loading} className="auth-btn">
          {loading ? "Creating account..." : "Create account"}
        </button>
        <Link href="/account/login" className="auth-link">
          Already have an account? Sign in
        </Link>
      </form>
      <style>{`
        .auth-card { max-width: 440px; margin: 0 auto; padding: 48px 32px; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(255,255,255,0.02); }
        .auth-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); margin-bottom: 16px; text-align: center; }
        .auth-heading { font-size: 1.8rem; font-weight: 300; text-transform: uppercase; line-height: 1.1; text-align: center; margin-bottom: 8px; }
        .auth-sub { font-size: 0.95rem; color: var(--fg-muted); text-align: center; margin-bottom: 32px; line-height: 1.55; }
        .auth-form { display: flex; flex-direction: column; gap: 16px; }
        .auth-label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); }
        .auth-input { padding: 14px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: rgba(255,255,255,0.03); color: var(--fg); font-family: var(--font); font-size: 16px; }
        .auth-input:focus { outline: none; border-color: var(--accent); }
        .auth-btn { padding: 16px 24px; min-height: 48px; border-radius: var(--radius-sm); background: #FFF; color: #000; border: 1px solid #FFF; font-family: var(--font); font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; margin-top: 8px; }
        .auth-btn:hover:not(:disabled) { background: var(--accent); color: #FFF; border-color: var(--accent); }
        .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-error { font-size: 13px; color: #ff6b6b; padding: 12px 14px; border-radius: var(--radius-sm); background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.25); }
        .auth-info { font-size: 13px; color: var(--accent); padding: 12px 14px; border-radius: var(--radius-sm); background: var(--accent-subtle); border: 1px solid var(--accent-border-subtle); }
        .auth-link { display: block; text-align: center; font-size: 13px; color: var(--fg-muted); margin-top: 12px; }
        .auth-link:hover { color: var(--accent); }
      `}</style>
    </div>
  );
}
```

**Notes:**
- No pre-fill of email from URL — Stripe doesn't pass customer email in the success_url, and we don't want to encourage typo entry by pre-filling from the email-link click (the email goes to the right address, but the link doesn't carry it).
- Server action handles the linkage so the browser never holds the service-role key.
- Client-side check for `password === confirm` and minLength 8.

## File 5 — `src/app/account/sign-up/actions.ts` (new)

```ts
"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function linkCustomerToAuthUser(
  email: string,
  authUserId: string,
  fullName: string
): Promise<{ linked: boolean }> {
  if (!email || !authUserId) return { linked: false };

  const supabase = createAdminClient();

  // Find an existing customers row (created by webhook) for this email.
  const { data: existing } = await supabase
    .from("customers")
    .select("id, auth_user_id, full_name")
    .eq("email", email)
    .maybeSingle();

  if (!existing) {
    // No prior purchase. Nothing to link. The webhook will populate later.
    return { linked: false };
  }

  if (existing.auth_user_id && existing.auth_user_id !== authUserId) {
    // Already linked to a different auth user. Don't overwrite — surface no-op.
    console.warn(
      `[sign-up] customers row for ${email} already linked to ${existing.auth_user_id}, ignoring new ${authUserId}`
    );
    return { linked: false };
  }

  const update: { auth_user_id: string; full_name?: string } = {
    auth_user_id: authUserId,
  };
  if (!existing.full_name && fullName) {
    update.full_name = fullName;
  }

  const { error } = await supabase
    .from("customers")
    .update(update)
    .eq("id", existing.id);

  if (error) {
    console.error("[sign-up] link update failed:", error);
    return { linked: false };
  }

  return { linked: true };
}
```

---

## File 6 — `src/app/account/login/page.tsx` (small edit)

Add a "Create account" link below "Forgot your password?" link. Single edit:

```tsx
        <Link href="/account/forgot-password" className="auth-link">
          Forgot your password?
        </Link>
+       <Link href="/account/sign-up" className="auth-link">
+         No account yet? Create one
+       </Link>
```

No other changes to login page.

---

## File 7 — `middleware.ts` (small edit)

Two changes:

1. Add `/account/sign-up` to `isAuthPage` array.
2. When unauthenticated user hits `/account` with `?purchase=success`, redirect to `/account/sign-up?purchase=success` instead of `/account/login` so the post-purchase intent is preserved.

```ts
  const path = request.nextUrl.pathname;
- const isAuthPage = ["/account/login", "/account/forgot-password", "/account/reset-password"].includes(path);
+ const isAuthPage = ["/account/login", "/account/sign-up", "/account/forgot-password", "/account/reset-password"].includes(path);
  const isAccountPage = path.startsWith("/account");

  if (isAccountPage && !isAuthPage && !user) {
+   // After Stripe checkout, customer hits /account?purchase=success while
+   // still logged out. Send them to sign-up rather than login.
+   if (path === "/account" && request.nextUrl.searchParams.get("purchase") === "success") {
+     const target = new URL("/account/sign-up", request.url);
+     target.searchParams.set("purchase", "success");
+     return NextResponse.redirect(target);
+   }
    return NextResponse.redirect(new URL("/account/login", request.url));
  }
```

---

## File 8 — `src/app/account/page.tsx` — no functional change

The existing flash banner already reads "Purchase confirmed. Your new product should appear below within a minute." That copy still works for the new flow. No change.

(If we wanted to make it more accurate post-signup-flow, we could reword to "Welcome! Your product is unlocked below." — but that's out of scope. Leaving alone.)

---

## File 9 — `scripts/smoke-test-webhook.ts` (rewrite)

Inversions and adjustments for the new flow:

```ts
/**
 * Phase B v2 smoke test for the Stripe webhook handler.
 *
 * The new flow does NOT create auth users from the webhook. The test asserts:
 *  - customers row created (auth_user_id IS NULL — no auth account yet)
 *  - customer_products row created with correct amount_paid_cents
 *  - NO auth.users row exists for the test email
 *  - purchase-confirmed email sent successfully (Resend success: true)
 */
import type Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { processCheckoutCompleted } from "../src/lib/webhook/process-checkout";

const SLUGS = [
  "lucid-horizon-workshop",
  "known-productions-workshop",
  "jt-visuals-workshop",
  "instagram-masterclass",
  "3d-made-easy",
  "910-sales-system",
  "910-admin-assistant",
];

type EmailStatus = "OK" | "FAIL" | "SKIPPED";

type Row = {
  slug: string;
  pass: boolean;
  email: EmailStatus;
  notes: string[];
};

function buildEvent(slug: string, plinkId: string, amountTotal: number, email: string): Stripe.Event {
  const sessionId = `cs_test_smoke_${slug}_${Date.now()}`;
  return {
    id: `evt_smoke_${slug}_${Date.now()}`,
    object: "event",
    api_version: "2024-09-30.acacia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        amount_total: amountTotal,
        currency: "usd",
        customer: null,
        customer_details: { email, name: "Webhook Smoke Test" },
        customer_email: email,
        payment_link: plinkId,
        metadata: {},
      } as unknown as Stripe.Checkout.Session,
    },
    livemode: true,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
  } as unknown as Stripe.Event;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.warn("Note: RESEND_API_KEY or EMAIL_FROM not set — emails will fail (logged, not fatal)");
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const rows: Row[] = [];

  for (const slug of SLUGS) {
    const notes: string[] = [];
    let pass = true;

    const { data: product, error: prodErr } = await sb
      .from("products")
      .select("id, slug, title, price_cents, stripe_payment_link_id")
      .eq("slug", slug)
      .maybeSingle();
    if (prodErr || !product?.stripe_payment_link_id) {
      rows.push({
        slug,
        pass: false,
        email: "SKIPPED",
        notes: [`product lookup failed: ${prodErr?.message ?? "missing plink"}`],
      });
      continue;
    }

    const email = `slodhy1+webhook-test-${slug}@gmail.com`;
    const event = buildEvent(slug, product.stripe_payment_link_id, product.price_cents, email);

    let processResult;
    try {
      processResult = await processCheckoutCompleted(event);
    } catch (e) {
      rows.push({
        slug,
        pass: false,
        email: "SKIPPED",
        notes: [`processCheckoutCompleted threw: ${(e as Error).message}`],
      });
      continue;
    }

    if (!processResult.success) {
      pass = false;
      notes.push(`process error: ${processResult.error}`);
    }

    let emailStatus: EmailStatus;
    if (processResult.emailResult === undefined) {
      emailStatus = "SKIPPED";
      pass = false;
      notes.push("no email sent (emailResult undefined)");
    } else if (processResult.emailResult.success) {
      emailStatus = "OK";
    } else {
      emailStatus = "FAIL";
      pass = false;
      notes.push(`email error: ${processResult.emailResult.error}`);
    }

    // Customer row created and unlinked (no auth user yet)
    const { data: customer } = await sb
      .from("customers")
      .select("id, auth_user_id")
      .eq("email", email)
      .maybeSingle();
    if (!customer) {
      pass = false;
      notes.push("no customers row");
    } else if (customer.auth_user_id !== null) {
      pass = false;
      notes.push(`auth_user_id should be null, got ${customer.auth_user_id}`);
    }

    if (customer) {
      const { data: cp } = await sb
        .from("customer_products")
        .select("id, amount_paid_cents")
        .eq("customer_id", customer.id)
        .eq("product_id", product.id)
        .maybeSingle();
      if (!cp) {
        pass = false;
        notes.push("no customer_products row");
      } else if (cp.amount_paid_cents !== product.price_cents) {
        pass = false;
        notes.push(`amount mismatch: got ${cp.amount_paid_cents}, expected ${product.price_cents}`);
      }
    }

    // Inversion: NO auth user should exist for this email
    const { data: list } = await sb.auth.admin.listUsers({ perPage: 200 });
    const ghost = list?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (ghost) {
      pass = false;
      notes.push(`unexpected auth user exists: ${ghost.id}`);
    }

    rows.push({ slug, pass, email: emailStatus, notes });
  }

  console.log("\nCleaning up DB rows…");
  const { data: testCustomers } = await sb
    .from("customers")
    .select("id")
    .like("email", "slodhy1+webhook-test-%@gmail.com");
  const testIds = testCustomers?.map((c) => c.id) ?? [];
  if (testIds.length > 0) {
    const { error: cpDelErr } = await sb
      .from("customer_products")
      .delete()
      .in("customer_id", testIds);
    if (cpDelErr) console.error("cp cleanup error:", cpDelErr);
  }
  const { error: cDelErr } = await sb
    .from("customers")
    .delete()
    .like("email", "slodhy1+webhook-test-%@gmail.com");
  if (cDelErr) console.error("customer cleanup error:", cDelErr);

  // Defensive: if any auth user matches our test pattern (shouldn't, in v2 flow) clean up too.
  const { data: authList } = await sb.auth.admin.listUsers({ perPage: 200 });
  const authMatches =
    authList?.users.filter((u) =>
      u.email?.toLowerCase().match(/^slodhy1\+webhook-test-.+@gmail\.com$/)
    ) ?? [];
  let deleted = 0;
  for (const u of authMatches) {
    const { error: delErr } = await sb.auth.admin.deleteUser(u.id);
    if (delErr) console.error(`auth delete error for ${u.email}:`, delErr);
    else deleted++;
  }
  if (deleted > 0) {
    console.log(`Defensive cleanup: deleted ${deleted} auth users (none expected in v2 flow)`);
  }

  console.log("\n=== Smoke test results ===");
  let allPass = true;
  for (const r of rows) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(
      `${status}  ${r.slug.padEnd(30)} EMAIL=${r.email.padEnd(7)} ${r.notes.length ? "— " + r.notes.join("; ") : ""}`
    );
    if (!r.pass) allPass = false;
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

## File 10 — `next.config.ts` — no change

`outputFileTracingIncludes` is already keyed to `./emails/**/*.html`, which globs all current and new email files including `purchase-confirmed.html`.

---

## File 11 — `src/app/api/stripe-webhook/route.ts` — no change

Thin POST wrapper continues to delegate to `processCheckoutCompleted`. No edit needed.

---

## Order of operations in execute step

1. Create `emails/purchase-confirmed.html` — already done in this session.
2. Create `src/lib/email/purchase-confirmed.ts` (File 1).
3. `git rm src/lib/email/welcome.ts` (File 2).
4. Rewrite `src/lib/webhook/process-checkout.ts` (File 3).
5. Create `src/app/account/sign-up/page.tsx` (File 4).
6. Create `src/app/account/sign-up/actions.ts` (File 5).
7. Edit `src/app/account/login/page.tsx` (File 6) — add "Create account" link.
8. Edit `middleware.ts` (File 7) — sign-up auth-page + purchase=success redirect.
9. Rewrite `scripts/smoke-test-webhook.ts` (File 9).
10. `npm run build` — must pass clean.
11. STOP for "deploy" approval.

---

## Files explicitly NOT touched

- `src/app/account/page.tsx` — no functional change required.
- `src/app/account/products/[slug]/page.tsx` — grant lookup unchanged.
- `src/app/account/forgot-password/page.tsx` and `reset-password/page.tsx` — protected per hard rule.
- `src/app/account/layout.tsx` — chrome only.
- `src/app/api/checkout/route.ts` — payment-link path is what the 7 plinks use.
- `src/lib/supabase/*` — already adequate.
- `next.config.ts` — globbing covers the new template.
- `vercel.json` — out of scope.
- All HTML in `public/` — out of scope.
- All Supabase migrations — out of scope (no schema changes).

---

## Risks / soft warnings

1. **Race: signup before webhook**. Customer signs up immediately after payment, webhook hasn't run yet. signUp's server action finds no `customers` row → no-op. Webhook arrives a moment later, looks up auth user by email, finds the just-created one, links `auth_user_id`. Closed by both sides doing email-based linkage in opposite directions. Verified in research §edge cases.

2. **Email confirmation flow**. If Supabase Auth has "Confirm email" enabled (default for new projects), users won't be signed in immediately after `auth.signUp` — they'll see the "Check your email…" info message. The `linkCustomerToAuthUser` server action runs regardless because `data.user` is returned even before confirmation. This is correct behavior.

3. **`auth.signUp` and existing email**. If someone tries to sign up with an email that already has an auth user (e.g. from a prior signup, or — in the migration window — from a Phase B 1.0 temp-password account), Supabase returns success with no session and sends a magic-link email; or, depending on settings, returns an `email_exists` error. Either way the user gets feedback. We don't try to second-guess the SDK behavior.

4. **Phase B 1.0 leftover auth users**. Any customer who paid during Phase B 1.0 has an auth user with a temp password. They can: (a) use forgot-password to reset, then sign in; or (b) attempt sign-up (which will conflict). We surface whatever Supabase says. No special-case migration code.

5. **Smoke test mutates production DB.** Same as before. 7 customers + 7 customer_products rows created and cleaned. **No** auth users created (key inversion vs Phase B 1.0).

6. **`linkCustomerToAuthUser` server-action security**. The action takes `email` and `authUserId` from the client. A malicious user could pass any email + any authUserId to claim someone else's customers row. Mitigation: the action runs only after `supabase.auth.signUp` succeeds for the given email — but we're trusting the client to pass the same email. Better: server-side, get the authenticated session and read `user.id` + `user.email` from there. Plan: add a guard inside the action that calls `createClient()` (anon SSR) → `auth.getUser()` → assert `user.id === authUserId` and `user.email === email` (case-insensitive). If mismatch, return without linking.

   **Updating the action spec to include this guard:**

   ```ts
   import { createClient as createServerClient } from "@/lib/supabase/server";
   // ...
   const sbServer = await createServerClient();
   const { data: { user } } = await sbServer.auth.getUser();
   if (!user || user.id !== authUserId || user.email?.toLowerCase() !== email.toLowerCase()) {
     console.warn("[sign-up] linkCustomerToAuthUser called with mismatched session", {
       sessionUserId: user?.id, claimedAuthUserId: authUserId,
       sessionEmail: user?.email, claimedEmail: email,
     });
     return { linked: false };
   }
   ```

   Plan applies this guard. The client doesn't get to lie about its identity.

---

## Stop point

Execute does NOT begin until user replies "go" (per spec Step 3).
