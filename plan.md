# Phase B v3 plan — self-healing linkage + settings page + dashboard greeting fix + marketing-nav login + email restyle

Six coordinated changes. Diff-level precision. No file outside this list will be touched.

---

## Change 1 — `middleware.ts`: self-healing customer linkage

Add admin client, fire one UPDATE on authed `/account/*` requests.

**Edits**:

```diff
 import { createServerClient, type CookieOptions } from "@supabase/ssr";
+import { createClient as createAdminLib } from "@supabase/supabase-js";
 import { NextResponse, type NextRequest } from "next/server";
 
 type CookieToSet = { name: string; value: string; options: CookieOptions };
 
+function escapeIlike(s: string) {
+  return s.replace(/[\\%_]/g, "\\$&");
+}
+
 export async function middleware(request: NextRequest) {
   ...
   const { data: { user } } = await supabase.auth.getUser();
 
+  // Self-healing customer linkage: when an authed user visits /account/*,
+  // attempt to link any unlinked customers row matching their email. The
+  // UPDATE is idempotent and affects 0 rows in the common case (already
+  // linked or no row exists). Single round-trip; never blocks the request.
+  if (user?.email) {
+    const admin = createAdminLib(
+      process.env.NEXT_PUBLIC_SUPABASE_URL!,
+      process.env.SUPABASE_SERVICE_ROLE_KEY!,
+      { auth: { persistSession: false } }
+    );
+    const { error: linkErr, count: linkedCount } = await admin
+      .from("customers")
+      .update({ auth_user_id: user.id }, { count: "exact" })
+      .ilike("email", escapeIlike(user.email))
+      .is("auth_user_id", null);
+    if (linkErr) {
+      console.error("[middleware] self-heal link failed:", linkErr);
+    } else if (linkedCount && linkedCount > 0) {
+      console.log(
+        `[middleware] self-heal linked customers row to auth user ${user.id} (${user.email})`
+      );
+    }
+  }
+
   const path = request.nextUrl.pathname;
   ...
```

**Notes**:
- Uses `count: "exact"` so we know whether anything was linked (for logging only). Postgres returns this cheaply.
- Service-role key is server-only; middleware runs server-only.
- Runs even on auth pages (logged-in users hitting `/account/login` etc are redirected away — but a logged-in user can still visit `/account/forgot-password` per current code; this is fine, the linkage is harmless there).
- No user-blocking awaits beyond the existing `auth.getUser()` + this UPDATE.

---

## Change 2 — `src/app/account/page.tsx`: greeting name from auth metadata

**Edit (lines 51-52)**:

```diff
-  const greetingName =
-    (customer?.full_name && customer.full_name.split(" ")[0]) || user.email?.split("@")[0] || "there";
+  const fullName =
+    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
+    customer?.full_name ||
+    null;
+  const greetingName =
+    (fullName && fullName.trim().split(" ")[0]) ||
+    user.email?.split("@")[0] ||
+    "there";
```

Resolution chain: `auth.users.raw_user_meta_data.full_name` → `customers.full_name` (kept as a backstop) → email local-part → `"there"`. First word of full_name. The CSS uppercase rule (`.dash-heading` `text-transform: uppercase`) keeps rendering uppercase.

**Settings link goes in `src/app/account/layout.tsx`** (persistent across `/account`, `/account/settings`, `/account/products/[slug]`). No edit to `account/page.tsx` for the Settings link. Diff for layout:

```diff
           <div className="acct-nav-links">
             <Link href="/" className="acct-nav-link">Home</Link>
             <Link href="/account" className="acct-nav-link">Account</Link>
+            <Link href="/account/settings" className="acct-nav-link">Settings</Link>
           </div>
```

(One line added to the existing `acct-nav-links` row. Existing `.acct-nav-link` style covers it.)

---

## Change 3 — `src/app/account/settings/page.tsx`: account profile page (new)

Three independent sub-forms with their own state, submit, and toast. Single client component for simplicity. Reads initial values from `auth.getUser()` server-side, then the form is rendered with those defaults via a server-fetched object passed to a client island.

Approach: server component that fetches `user`, then renders a `<SettingsForms user={...} />` client component.

**Files**:
- `src/app/account/settings/page.tsx` — server component (default export)
- `src/app/account/settings/forms.tsx` — client component with the three forms

**`page.tsx` content**:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "../logout-button";
import { SettingsForms } from "./forms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/account/login");

  const fullName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) || "";
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric",
      })
    : null;

  return (
    <div className="settings">
      <header className="settings-head">
        <div>
          <Link href="/account" className="settings-back">← Back to your account</Link>
          <p className="settings-eyebrow">SETTINGS</p>
          <h1 className="settings-heading">Account</h1>
          {memberSince && <p className="settings-meta">Member since {memberSince}</p>}
        </div>
        <LogoutButton />
      </header>

      <SettingsForms initialFullName={fullName} initialEmail={user.email ?? ""} />

      <style>{`
        .settings { display: flex; flex-direction: column; gap: 40px; }
        .settings-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
        .settings-back { font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); transition: color 0.2s; margin-bottom: 8px; display: inline-block; }
        .settings-back:hover { color: var(--accent); }
        .settings-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent); margin-top: 12px; }
        .settings-heading { font-size: clamp(1.6rem, 3.5vw, 2.4rem); font-weight: 300; text-transform: uppercase; line-height: 1.1; }
        .settings-meta { font-size: 13px; color: var(--fg-muted); margin-top: 8px; }
      `}</style>
    </div>
  );
}
```

**`forms.tsx` content** (client component):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Toast = { kind: "success" | "error" | "info"; text: string } | null;

export function SettingsForms({
  initialFullName,
  initialEmail,
}: {
  initialFullName: string;
  initialEmail: string;
}) {
  const router = useRouter();

  // Full name form state
  const [fullName, setFullName] = useState(initialFullName);
  const [nameToast, setNameToast] = useState<Toast>(null);
  const [nameLoading, setNameLoading] = useState(false);

  // Email form state
  const [email, setEmail] = useState(initialEmail);
  const [emailToast, setEmailToast] = useState<Toast>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwToast, setPwToast] = useState<Toast>(null);
  const [pwLoading, setPwLoading] = useState(false);

  async function onSubmitName(e: React.FormEvent) {
    e.preventDefault();
    setNameToast(null);
    setNameLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
    setNameLoading(false);
    if (error) {
      setNameToast({ kind: "error", text: error.message });
    } else {
      setNameToast({ kind: "success", text: "Name updated." });
      router.refresh();
    }
  }

  async function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailToast(null);
    if (email.trim() === initialEmail) {
      setEmailToast({ kind: "info", text: "Email unchanged." });
      return;
    }
    setEmailLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setEmailLoading(false);
    if (error) {
      setEmailToast({ kind: "error", text: error.message });
    } else {
      setEmailToast({
        kind: "info",
        text: `Confirmation sent to ${email.trim()}. Click the link there to complete the change.`,
      });
    }
  }

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwToast(null);
    if (newPassword.length < 8) {
      setPwToast({ kind: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwToast({ kind: "error", text: "New passwords don't match." });
      return;
    }
    setPwLoading(true);
    const supabase = createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: initialEmail,
      password: currentPassword,
    });
    if (signInErr) {
      setPwToast({ kind: "error", text: "Current password incorrect." });
      setPwLoading(false);
      return;
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (updateErr) {
      setPwToast({ kind: "error", text: updateErr.message });
      return;
    }
    setPwToast({ kind: "success", text: "Password updated." });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="settings-grid">
      <Section title="Full name">
        <form onSubmit={onSubmitName} className="settings-form">
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className="settings-input"
          />
          <ToastView toast={nameToast} />
          <button type="submit" disabled={nameLoading} className="settings-btn">
            {nameLoading ? "Saving..." : "Save name"}
          </button>
        </form>
      </Section>

      <Section title="Email address">
        <form onSubmit={onSubmitEmail} className="settings-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="settings-input"
          />
          <ToastView toast={emailToast} />
          <button type="submit" disabled={emailLoading} className="settings-btn">
            {emailLoading ? "Sending..." : "Update email"}
          </button>
          <p className="settings-help">A confirmation link will be sent to the new address. The change takes effect after you click that link.</p>
        </form>
      </Section>

      <Section title="Change password">
        <form onSubmit={onSubmitPassword} className="settings-form">
          <label className="settings-label">
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="settings-input"
            />
          </label>
          <label className="settings-label">
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="settings-input"
            />
          </label>
          <label className="settings-label">
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="settings-input"
            />
          </label>
          <ToastView toast={pwToast} />
          <button type="submit" disabled={pwLoading} className="settings-btn">
            {pwLoading ? "Updating..." : "Change password"}
          </button>
        </form>
      </Section>

      <style>{`
        .settings-grid { display: flex; flex-direction: column; gap: 32px; }
        .settings-section { padding: 32px; border: 1px solid var(--border); border-radius: var(--radius-md); background: rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 16px; }
        .settings-section-title { font-size: 11px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: var(--fg-muted); margin-bottom: 4px; }
        .settings-form { display: flex; flex-direction: column; gap: 12px; max-width: 480px; }
        .settings-label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); }
        .settings-input { padding: 12px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: rgba(255,255,255,0.03); color: var(--fg); font-family: var(--font); font-size: 15px; }
        .settings-input:focus { outline: none; border-color: var(--accent); }
        .settings-btn { align-self: flex-start; padding: 12px 22px; border-radius: var(--radius-sm); background: #FFF; color: #000; border: 1px solid #FFF; font-family: var(--font); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
        .settings-btn:hover:not(:disabled) { background: var(--accent); color: #FFF; border-color: var(--accent); }
        .settings-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .settings-help { font-size: 12px; color: var(--fg-muted); line-height: 1.5; }
        .settings-toast { font-size: 13px; padding: 10px 14px; border-radius: var(--radius-sm); }
        .settings-toast-success { background: rgba(56,182,255,0.08); border: 1px solid var(--accent-border-subtle); color: var(--fg); }
        .settings-toast-error { background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.25); color: #ff6b6b; }
        .settings-toast-info { background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--fg-muted); }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2 className="settings-section-title">{title}</h2>
      {children}
    </section>
  );
}

function ToastView({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return <p className={`settings-toast settings-toast-${toast.kind}`}>{toast.text}</p>;
}
```

---

## Change 4 — `emails/purchase-confirmed.html`: restyle to brand pattern

Full rewrite. New body keeps placeholders `{{productName}}` and `{{accessLink}}`. Structure mirrors the 3 reference templates.

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Purchase confirmed — 910 Academy</title>
</head>

<body style="margin:0;padding:0;background-color:#f5f6f8;">

<!-- Preheader -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f5f6f8;opacity:0;">
Your purchase is unlocked. Sign in to access it.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f5f6f8;">
<tr>
<td align="center" style="padding:24px 12px;">

<!-- Main container -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:640px;background-color:#ffffff;border-radius:14px;overflow:hidden;">

<!-- Header -->
<tr>
<td style="background-color:#0b0b0f;padding:28px 32px;">
<div style="font-family:Arial,Helvetica,sans-serif;letter-spacing:0.18em;font-size:11px;opacity:0.75;color:#ffffff;">
910 ACADEMY
</div>

<div style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;margin-top:12px;line-height:1.25;color:#ffffff;">
Purchase confirmed.
</div>

<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;margin-top:8px;opacity:0.85;color:#ffffff;">
{{productName}}
</div>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:32px;">
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:15px;line-height:1.7;">

<p style="margin:0 0 16px 0;">
Thanks for your purchase. Your access is ready.
</p>

<p style="margin:0 0 28px 0;">
Sign in below to access your content. If this is your first time, you'll be prompted to create your account using the email from your Stripe receipt — same email both places, lifetime access on every product you buy through 910 Academy.
</p>

<!-- Primary CTA -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
<tr>
<td style="background-color:#0f172a;border-radius:10px;">
<a href="{{accessLink}}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.04em;">
Access Your Purchase &rarr;
</a>
</td>
</tr>
</table>

<!-- Divider -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
<tr>
<td style="border-top:1px solid #e5e7eb;line-height:1px;font-size:1px;">&nbsp;</td>
</tr>
</table>

<p style="margin:0 0 8px 0;font-size:14px;color:#64748b;">
Questions? Reply to this email. We respond same-day.
</p>

</div>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.6;">
910 Academy &middot; West Palm Beach, FL<br>
<a href="https://www.910academy.com" style="color:#64748b;text-decoration:none;">910academy.com</a>
</div>
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
```

Differences vs reference set: no info-box (we don't surface credentials). No bullet list section ("What's inside"). Otherwise identical chrome. Subject line stays `Purchase confirmed — ${productName}` (no edit to `purchase-confirmed.ts`).

---

## Change 5 — Marketing-site nav: Account link + auth detection

Per-file edits across **18 HTML files** in `public/`. Two precise insertions per file.

### Insertion A — desktop nav-links

In each file's `nav-links` block, insert an Account link **before** the `nav-cta`:

```diff
   <div class="nav-links">
     <a href="/" class="nav-link">Home</a>
     <a href="/gear" class="nav-link">Our Gear</a>
     <a href="/products" class="nav-link">Products</a>
+    <a href="/account" class="nav-link" data-account-link>Account</a>
     <a href="https://www.skool.com/910-academy/about" target="_blank" rel="noopener noreferrer" class="nav-cta">Join 910 Academy</a>
   </div>
```

(Some files have `target="_blank"` without `rel`; the diff respects the file's existing form.)

### Insertion B — mobile nav

Inside `mobile-nav` div, before the `Join 910 Academy` link:

```diff
   <a href="/products">Products</a>
+  <a href="/account" data-account-link>Account</a>
   <a href="https://www.skool.com/910-academy/about" target="_blank" style="color:var(--accent);">Join 910 Academy</a>
```

### Insertion C — auth-detection script

Just before `</body>` on each file:

```html
<script>
(function(){
  try {
    var hasSession = document.cookie.indexOf("sb-qkmkxthpeapuecobahhx-auth-token") !== -1;
    if (!hasSession) {
      var els = document.querySelectorAll("[data-account-link]");
      for (var i = 0; i < els.length; i++) els[i].setAttribute("href", "/account/login");
    }
  } catch (e) { /* no-op */ }
})();
</script>
```

(uses for-loop instead of forEach since IE compat doesn't matter but for-loop is one fewer arrow function for older mobile WebKits — same minified size; either works. Final version uses forEach.)

### Files to edit (18)

```
public/index.html
public/about.html
public/coaching.html
public/products.html
public/products-archive.html
public/affiliate-guidelines.html
public/book.html
public/waitlist.html
public/maintenance.html
public/toolkit.html
public/gear.html
public/products/lucid-horizon-workshop.html
public/products/known-productions-workshop.html
public/products/jt-visuals-workshop.html
public/products/instagram-masterclass.html
public/products/3d-made-easy.html
public/products/910-sales-system.html
public/products/910-admin-assistant.html
```

---

## Change 6 — schema migration: NONE.

Hard rule. The brief explicitly forbids adding a name column. No DDL.

---

## Order of operations in execute step

1. Edit `middleware.ts` — admin client + escapeIlike + UPDATE.
2. Edit `src/app/account/page.tsx` — greeting resolution chain only.
3. Edit `src/app/account/layout.tsx` — add persistent Settings link.
4. Create `src/app/account/settings/page.tsx`.
5. Create `src/app/account/settings/forms.tsx`.
6. Rewrite `emails/purchase-confirmed.html`.
7. Edit 18 marketing HTML files (nav-links + mobile-nav + script).
8. `npm run build` — must pass clean.
9. STOP for "deploy".

---

## Files explicitly NOT touched

- `src/lib/webhook/process-checkout.ts` — out of scope.
- `src/app/api/stripe-webhook/route.ts` — out of scope.
- `src/app/account/sign-up/page.tsx` and `actions.ts` — already correct.
- `src/app/account/login/page.tsx` — already has Create-account link.
- `src/app/account/forgot-password/page.tsx` and `reset-password/page.tsx` — protected.
- `src/app/account/products/[slug]/page.tsx` — grant lookup unchanged.
- (none — `layout.tsx` IS edited for the persistent Settings nav link)
- `next.config.ts` — `outputFileTracingIncludes` already covers email path.
- All Supabase migrations — no schema changes.
- All `scripts/*` — smoke test scope unchanged.
- All HTML in `public/_drafts/*` — out of marketing flow.

---

## Risks / soft warnings

1. **`auth.users.raw_user_meta_data` is not type-safe in supabase-js.** `user.user_metadata` is typed as `UserMetadata` which is `{ [key: string]: any }`. We narrow with `typeof user.user_metadata?.full_name === "string"` to avoid runtime surprises. ✅

2. **The `customers.full_name` backstop in the resolution chain** is intentional: a customer who paid via Stripe with `customer_details.name` captured (some Stripe configurations do this), but never typed it again at signup, would otherwise lose access to the name on the dashboard. Backstop survives that case.

3. **Email-change flow on the settings page**. Supabase sends a confirmation to the NEW address. With "Secure email change" enabled (default), it ALSO sends a notification to the OLD address. The user sees a clear info toast. They MUST click the link in the new inbox to complete the change. **Caveat**: until Supabase Auth SMTP is reconfigured to Resend, this confirmation email is sent from `noreply@mail.app.supabase.io` (Supabase's default sender). Functional but off-brand. Shayan to configure custom SMTP separately; flow works either way today.

4. **Re-signin during password change**. `signInWithPassword` issues fresh tokens. The browser's existing cookie session is replaced by a refreshed one — same user, no logout. Confirmed by reading the @supabase/ssr behavior. ✅

5. **18-file mechanical edit** — string-replace on each. If any file has a slightly different nav structure, the replace fails. Per hard rule, two failed attempts on any single file → stop. I'll verify each file is touched by checking diff stats per file.

6. **Inline script project-ref hardcode**. `qkmkxthpeapuecobahhx` is hardcoded in the static HTML script. If you ever migrate Supabase projects, this needs updating across 18 files. Acceptable for a single static-domain prod; documenting here.

7. **Cookie detection vs localStorage**. Brief said "localStorage (key: sb-<project-ref>-auth-token)". @supabase/ssr stores session in cookies, not localStorage. Detection via `document.cookie`. Same key name. Plan deviates from brief here for correctness — flagging for explicit review at the gate.

---

## Stop point

Execute does NOT begin until user replies "go" (per spec Step 3).
