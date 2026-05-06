# Phase B v3 research

## Preconditions
- `emails/` contains 4 files: `welcome-email.html` (4536B), `migration-email.html` (4606B), `password-reset-email.html` (3811B), `purchase-confirmed.html` (2092B). ✅
- Supabase email confirmation disabled by user (asserted, can't verify from CLI). ✅

---

## Brand pattern across the 3 reference templates

`welcome-email.html`, `migration-email.html`, `password-reset-email.html` share **identical** chrome:

| Element | Style |
|---|---|
| `<body>` background | `#f5f6f8` (light cool grey) |
| Outer wrapper padding | `24px 12px` |
| Main container | 640px max-width, `#ffffff`, `border-radius:14px`, `overflow:hidden` |
| Header band | `background:#0b0b0f`, `padding:28px 32px`, white text |
| Header eyebrow | Arial 11px, `letter-spacing:0.18em`, `opacity:0.75`, white, "910 ACADEMY" |
| Header title | Arial 26px **bold**, `margin-top:12px`, `line-height:1.25`, white |
| Header subtitle | Arial 14px, `margin-top:8px`, `opacity:0.85`, white |
| Body | `padding:32px`, Arial, color `#0f172a`, font-size 15px, `line-height:1.7` |
| Info box | `background:#f8fafc`, border `#e5e7eb`, `border-radius:10px`, padding `20px 22px` |
| Box eyebrow | 11px, `letter-spacing:0.12em`, color `#64748b` |
| CTA button | `background:#0f172a`, `border-radius:10px`; anchor: padding `14px 28px`, white 14px **bold**, `letter-spacing:0.04em`, includes `→` arrow |
| Footer | `background:#f8fafc`, `border-top:1px solid #e5e7eb`, `padding:20px 32px`, 12px `#64748b`, includes city + 910academy.com link |

The current `purchase-confirmed.html` uses a totally different palette (`#F4F2ED` cream, no dark header band, system font stack). Restyle target: **port the header-band + container + button + footer** structure verbatim, keeping the two existing placeholders.

Headline change: "Purchase confirmed." → use as the bold header title in the dark band. Subtitle: a short "Same purchases, new home" equivalent — proposed `Your purchase is unlocked.`

---

## `customers` schema (from `0001_init_products_schema.sql`, unchanged)

```sql
create table public.customers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  email text not null unique,
  full_name text,
  stripe_customer_id text unique,
  auth_user_id uuid references auth.users(id) on delete set null
);
```

**No `name` column** — there's `full_name`, but only a single column. Per Phase B v3 hard rule, we don't add another. ✅

The `email` is `unique`, `auth_user_id` is nullable, RLS policies on `customers`:
- SELECT: `auth.uid() = auth_user_id`
- No UPDATE policy → anon clients cannot UPDATE.

**Implication for self-healing linkage**: the middleware needs an admin (service-role) client to perform the UPDATE — the existing anon client in middleware can't do it without an UPDATE RLS policy, and adding RLS is more state to maintain than just instantiating an admin client.

---

## Current middleware behavior (`middleware.ts`)

51 lines. Single Supabase anon client via `createServerClient` from `@supabase/ssr`. Calls `auth.getUser()` then routes based on `isAuthPage` / `isAccountPage` flags. **Does NOT touch the `customers` table.**

The matcher already covers `/account/:path*` so the new self-healing link runs on the right requests for free.

**What needs to change**:
1. Add admin client (service-role) usage. Avoid leaking service-role key — only used server-side; middleware runs server-side.
2. After `auth.getUser()` returns a user (i.e. authenticated), fire one UPDATE that links any unlinked customers row matching the user's email.
3. Idempotent: when no row matches (already linked OR no row exists), the UPDATE affects 0 rows. No SELECT round-trip.

**Case-sensitivity caveat**: `customers.email` may have come from Stripe in mixed case. Brief says "LOWER comparison". Two clean options in supabase-js:
- (a) `.ilike("email", escapedEmail)` — ILIKE with no wildcards is case-insensitive equality. Must escape `_`, `%`, `\` from the email before passing (RFC 5322 allows `_` in local-part).
- (b) `.eq("email", user.email!.toLowerCase())` — relies on Stripe + Supabase auth always normalizing to lowercase. 99% reliable.

Plan picks **(a)** — it matches the spec literally and handles edge-cases.

**`auth_user_id IS NULL` filter**: supabase-js `.is("auth_user_id", null)` produces SQL `auth_user_id IS NULL`, correct.

The full update call (one round-trip):
```ts
await admin
  .from("customers")
  .update({ auth_user_id: user.id })
  .ilike("email", escapeIlike(user.email!))
  .is("auth_user_id", null);
```

---

## Dashboard greeting bug — `src/app/account/page.tsx`

**Current logic (lines 28-52):**

```ts
const { data: customer } = await supabase
  .from("customers")
  .select("id, full_name, email")
  .eq("auth_user_id", user.id)
  .maybeSingle();

// ...

const greetingName =
  (customer?.full_name && customer.full_name.split(" ")[0]) || user.email?.split("@")[0] || "there";
```

**Bug**: pulls `full_name` from the `customers` table. The `customers.full_name` is populated from:
1. Stripe webhook setting `session.customer_details.name` if Stripe collected name at checkout (most plinks don't), OR
2. The signup server action `linkCustomerToAuthUser` setting it from the form's `full_name` field — but that only runs when a `customers` row already exists (paid first, signed up after).

**For a customer who signed up but never paid (or paid via a Stripe link that didn't capture name)**, `customers.full_name` stays NULL → fallback to `user.email.split("@")[0]` → first word of email local-part. For "claudio.rivera@gmail.com" that yields "claudio.rivera", which is rendered uppercased via the `.dash-heading { text-transform: uppercase }` CSS rule on line 103.

**The user's auth-side metadata** (`auth.users.raw_user_meta_data.full_name`) is the source of truth for the name they typed in the signup form — written via `auth.signUp({ options: { data: { full_name } } })` in the new signup flow. That field is not consulted at all today.

**Fix per spec**: read `user.user_metadata?.full_name` first; first word of full_name → local-part of email → "there". Don't change the rendered HTML, just the resolution chain. (`user.user_metadata` is the SDK alias for `auth.users.raw_user_meta_data`.)

I did not find any literal "HELLO" string in the source — the user's report likely refers to the uppercased fallback ("there" → "THERE", or the email local-part rendered in uppercase). Fix is the same regardless.

---

## Marketing-site nav inventory

`/public/*.html` files with the marketing nav:

| File | Has `nav.nav` block | Has `mobile-nav` | Notes |
|---|---|---|---|
| `public/index.html` | yes (line 2137) | yes (line 2155) | Homepage |
| `public/about.html` | yes | yes | |
| `public/coaching.html` | yes | yes | |
| `public/products.html` | yes | yes | Storefront grid |
| `public/products-archive.html` | yes | yes | |
| `public/affiliate-guidelines.html` | yes | yes | |
| `public/book.html` | yes | yes | |
| `public/waitlist.html` | yes | yes | |
| `public/maintenance.html` | yes | yes | (catch-all redirect target) |
| `public/toolkit.html` | yes | yes | |
| `public/gear.html` | yes | yes | |
| `public/products/lucid-horizon-workshop.html` | yes (line 704) | yes (line 721) | |
| `public/products/known-productions-workshop.html` | yes | yes | |
| `public/products/jt-visuals-workshop.html` | yes | yes | |
| `public/products/instagram-masterclass.html` | yes | yes | |
| `public/products/3d-made-easy.html` | yes | yes | |
| `public/products/910-sales-system.html` | yes | yes | |
| `public/products/910-admin-assistant.html` | yes | yes | |

**18 HTML files** to update. Same nav structure on each:

```html
<div class="nav-links">
  <a href="/" class="nav-link">Home</a>
  <a href="/gear" class="nav-link">Our Gear</a>
  <a href="/products" class="nav-link">Products</a>
  <a href="https://www.skool.com/910-academy/about" target="_blank" class="nav-cta">Join 910 Academy</a>
</div>
```

Mobile-nav has the same items in a different layout.

**Insertion plan**: add `<a href="/account" class="nav-link" data-account-link>Account</a>` between Products and the nav-cta. Same in mobile-nav.

**Auth-state detection**: brief says "checks for Supabase session in localStorage (key: sb-<project-ref>-auth-token)". @supabase/ssr's `createBrowserClient` actually stores the session in **cookies**, not localStorage — the cookie is also named `sb-<project-ref>-auth-token`. The Next.js account flow runs through SSR/cookies. Pure marketing pages don't load Supabase JS, so they need to detect via `document.cookie` (cookies are visible to same-origin JS for non-HttpOnly cookies; @supabase/ssr writes them as non-HttpOnly so the browser client can read them).

**Plan**: detect via `document.cookie.includes("sb-qkmkxthpeapuecobahhx-auth-token")`. Project ref hardcoded — same value already lives in `NEXT_PUBLIC_SUPABASE_URL`. Cheap, no fetch, no JS bundle.

**Default render**: link as `<a href="/account">Account</a>`. If detection finds no cookie, swap the href to `/account/login`. (When logged out, clicking `/account` would also redirect through middleware to login — but the spec wants the URL to be correct from the start so there's no extra redirect.)

Inline script (one block per HTML file, dropped just before `</body>`):
```html
<script>
(function(){
  try {
    var hasSession = document.cookie.indexOf("sb-qkmkxthpeapuecobahhx-auth-token") !== -1;
    if (!hasSession) {
      document.querySelectorAll("[data-account-link]").forEach(function(el){
        el.setAttribute("href", "/account/login");
      });
    }
  } catch (e) { /* no-op */ }
})();
</script>
```

Tiny, no external deps, runs before paint thanks to non-async <script>.

**Layout file**: `src/app/account/layout.tsx` already has its own nav (lines 6-16). The marketing nav and the account nav are separate. The brief asks for a marketing-site nav addition — only the static HTMLs need updating, not the Next.js account layout. Confirmed.

---

## Other files reviewed (no changes needed in v3)

- `src/lib/webhook/process-checkout.ts` — out of scope per hard rule.
- `src/app/account/sign-up/page.tsx` and `actions.ts` — already in place from Phase B v2; no edits.
- `src/app/account/login/page.tsx` — already has "Create account" link. No edits.
- `src/lib/supabase/admin.ts` — adequate (10 lines), reuse for middleware admin client.

---

## Files to create / edit (preview — exact diffs in plan.md)

| File | Action |
|---|---|
| `middleware.ts` | edit — add admin client, fire self-healing UPDATE on authed `/account/*` requests |
| `src/app/account/page.tsx` | edit — change `greetingName` resolution to read `user.user_metadata?.full_name` first |
| `src/app/account/settings/page.tsx` | new — three sub-forms (full name, email, password) |
| `src/app/account/page.tsx` | edit — add "Settings" link in dashboard header |
| `src/app/account/layout.tsx` | edit — add "Settings" link in account nav (alternative to inline link in dashboard; I'll pick one in the plan) |
| `emails/purchase-confirmed.html` | rewrite — restyle to brand pattern |
| 18 × `public/**/*.html` | edit — insert Account link in nav-links + mobile-nav, plus inline detection script |

`next.config.ts`: no change. `outputFileTracingIncludes` already covers email path globs.

---

## Risks / soft warnings

1. **Admin client in middleware** runs on every authed `/account/*` request — adds one network round-trip to Supabase per request even when no link is needed. With <50 customers and minimal traffic, the cost is negligible. If we ever serve >100 req/s on the dashboard, consider caching "recently linked" by user id in a request-scoped flag or a short-TTL edge cache. Out of scope for v3.

2. **`ILIKE` escape**. Need `escapeIlike(s)` that backslash-escapes `_`, `%`, `\`. Trivial.

3. **Email change flow**. `supabase.auth.updateUser({ email })` triggers a confirmation to the new address. **The user must click the link in the new inbox** before the email actually changes. We surface a clear "check your new email" toast. If Supabase has "Secure email change" on (default), it ALSO sends a notification to the old address — desired behavior.

4. **Password change flow**. The spec asks: "verify by re-calling supabase.auth.signInWithPassword first, then updateUser({ password }) on success". Re-signing-in causes Supabase to refresh tokens, which writes new cookies. That's fine — the user stays signed in. Edge case: if the current password is wrong, signInWithPassword errors → we surface to UI, never call updateUser. ✅

5. **Static HTML inline script**. Project ref `qkmkxthpeapuecobahhx` is currently visible in the script. That's the same value already exposed in the Supabase URL on every page that loads `@supabase/ssr` (not these static pages, but the rest of the site). It's not a secret — anon URLs are public by design. ✅

6. **`/account/settings` is logged-in-only**. The new page is at `/account/settings` which the existing middleware already protects (matches `/account/:path*`, not in `isAuthPage` list, so unauth → redirect to login). No middleware addition needed for the page.

7. **Settings page email-edit concern**. After `updateUser({ email })`, Supabase will set `email_change` field internally; `user.email` keeps the OLD email until confirmation. If the user navigates away and back, they'll see the old email still. We add an info toast: "Confirmation sent to <newEmail>. Click the link there to complete the change." That's the truth of the flow.

8. **18-file static HTML update is repetitive but mechanical**. I'll do all 18 in execute step. If any HTML uses a different nav structure, the targeted string replace will not match → I'll surface that file and adjust per-file. Two failed attempts on any single file → stop per hard rule.

## Open questions to flag, not blocking

- **Settings page nav link**: in `src/app/account/page.tsx` header (alongside LogoutButton) or in the account `layout.tsx` nav-links? Plan: layout.tsx — it's persistent across `/account`, `/account/settings`, `/account/products/[slug]`. One source of truth.
- **What does the email-change UI say while pending confirmation?** Plan: a non-dismissable info banner if `user.new_email` is set, telling user to confirm. Simpler: just the toast immediately after submit; rely on Supabase's email link to finish the flow.
