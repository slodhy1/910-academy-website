# Phase B v2 research — webhook rework + customer signup + new email

## Preconditions
- `emails/purchase-confirmed.html` — present (light theme, two placeholders confirmed):
  - line 17: `{{productName}}`
  - line 22: `{{accessLink}}`

## Schema — `public.customers` (from migration 0001, unchanged through 0005)

```sql
create table public.customers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now() not null,
  email text not null unique,            -- natural key for email-based linking
  full_name text,
  stripe_customer_id text unique,
  auth_user_id uuid references auth.users(id) on delete set null  -- nullable
);

create table public.customer_products (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid references public.customers(id) on delete cascade not null,
  product_id uuid references public.products(id) on delete cascade not null,
  stripe_session_id text,
  amount_paid_cents integer,
  unique(customer_id, product_id)
);
```

**Critical findings:**

| Question | Answer |
|---|---|
| Is `customers.id == auth.users.id`? | **No.** `customers.id` is an independent UUID. |
| Is `auth_user_id` nullable? | **Yes**, with `on delete set null`. |
| Is `email` unique on `customers`? | **Yes** (UNIQUE constraint). Natural key for linkage. |
| Does `customer_products` reference auth users? | **No** — references `customers.id`, which is stable. |
| Migration required? | **NO.** Schema already supports the new flow. |

The schema is already perfectly shaped for the new model:
- Webhook can create `customers` rows with `auth_user_id = null` (no auth user yet).
- Customer signs up later → server action sets `auth_user_id` by matching `email`.
- Grants on `customer_products` reference stable `customers.id` regardless of when signup happens.

## Current grant lookup pattern

Both `src/app/account/page.tsx` (line 32) and `src/app/account/products/[slug]/page.tsx` (line 65) lookup customer by `auth_user_id = user.id`. So the SSR auth-user → customer chain is:

```
auth.users.id  →  customers.auth_user_id  →  customers.id  →  customer_products.customer_id
```

For the new flow to work, after signup we MUST link `customers.auth_user_id` to the new `auth.users.id`. Otherwise the dashboard fetches `customers` by `auth_user_id` and finds nothing → empty state.

## Sign-up route — does NOT exist

`grep -rn "signUp\|sign-up" src/` → 0 matches. Need to create `/account/sign-up`.

## Login flow — `src/app/account/login/page.tsx`

Client component. Calls `supabase.auth.signInWithPassword`. After success → `router.push("/account")`. No "Create account" link present. Need to add.

## Middleware — `middleware.ts`

Matcher: `/account/:path*`. Behavior:
- `isAuthPage` = `["/account/login", "/account/forgot-password", "/account/reset-password"]`
- Logged-in users on auth pages → redirect to `/account`
- Logged-out users on `/account/*` non-auth → redirect to `/account/login`

**Two implications for the new flow:**

1. After purchase, Stripe redirects to `/account?purchase=success`. The customer is **not logged in yet** (signup happens AFTER payment). The middleware redirects them to `/account/login`, **dropping the `?purchase=success` query param** in the redirect.

2. The new `/account/sign-up` page is by definition for not-logged-in users → must be added to `isAuthPage` so middleware doesn't bounce them, AND so logged-in users on this page get redirected to `/account`.

**Required middleware changes (small):**
- Add `/account/sign-up` to `isAuthPage`.
- Special-case `/account?purchase=success` for not-logged-in users → redirect to `/account/sign-up?purchase=success` (preserves intent).

## Stripe checkout flow — `src/app/api/checkout/route.ts`

Currently the 7 active products use `stripe_payment_link` directly (line 31-33 returns the buy.stripe.com URL without going through Stripe's session API). The `success_url: ${siteUrl}/account?purchase=success` at line 48 only applies to the unused `stripe_price_id` path.

So the actual success URL is **whatever each Stripe payment link is configured to redirect to in the Stripe dashboard**. Per the brief: "Don't break the existing 7 plinks — success_url stays /account?purchase=success" — confirming all 7 plinks are already configured to redirect to that URL.

**No changes needed to checkout/route.ts or the plinks.**

## Existing files to leave alone

- `src/app/account/forgot-password/page.tsx` — uses `resetPasswordForEmail`, works on existing accounts. Not affected.
- `src/app/account/reset-password/page.tsx` — handles the reset link callback. Not affected.
- `src/app/account/products/[slug]/page.tsx` — grant lookup unchanged.
- `src/app/account/layout.tsx` — top-level chrome only.
- `src/app/api/checkout/route.ts` — payment link path unchanged.

## Edge cases

| Scenario | Handling |
|---|---|
| **Pays then never signs up** | Orphan `customers` row with `auth_user_id = null`. Email goes out with `accessLink` → /account?purchase=success → middleware redirects unsigned to /account/sign-up. They sign up later (could be days later) using the same email → server action links the row. |
| **Signs up before paying** | Auth user exists, no `customers` row. They land on /account → empty state. They pay → webhook upsert `customers` by email → webhook also detects existing auth user with this email (admin.listUsers) → links `auth_user_id`. |
| **Pays twice with same email** | First payment: webhook creates `customers` + first `customer_products`. Second payment: `customers` upsert by email finds existing row, no-ops; `customer_products` upsert on `(customer_id, product_id)` adds the second grant. Both visible on next `/account` load. New flow only sends purchase-confirmed email if `wasNewCustomer` (no existing customers row before this insert). |
| **Tries to sign up with email already linked to an account** | Server action checks: if `customers.auth_user_id IS NOT NULL` for this email, return error "An account already exists — please sign in." |
| **Tries to sign up with email that already has an auth user (no customers row)** | Supabase `auth.signUp` will return `email_exists` or success-but-no-confirmation depending on config. We surface that error verbatim. |
| **Confirms email but signup hasn't completed (Supabase email-verification flow)** | Out of scope for this work. Whatever the project's email-confirmation setting is, applies. We don't fight it. |
| **Customer pays, sees email, clicks link, /account/sign-up, but webhook hasn't finished yet** | Race: webhook is fast (<1s typically). If they sign up immediately and the customers row doesn't exist yet, the linkage step finds nothing, signup completes, they hit /account → empty state. Webhook arrives milliseconds later → creates customers row but with `auth_user_id = null` (because they signed up first). The dashboard fetches by `auth_user_id` → nothing. **This is a race condition.** Mitigation: webhook should ALSO check for existing auth user by email and link if found. With both webhook AND signup doing the email-based linkage in opposite directions, the race is closed. |

## Risks and assumptions

1. **`auth.admin.listUsers` lacks email filter in supabase-js 2.45.0.** Same constraint as Phase B. Pagination at 200 per page, `find()` by email. At <50 customers today, fine. Plan flag for future.

2. **Supabase email confirmation setting.** If "Confirm email" is enabled in Supabase Auth → users must click verification link before signing in. Whatever the current project setting is, applies. Not changing it.

3. **`signUp` with already-existing email on Supabase.** Public `auth.signUp` returns success with no session (anti-enumeration default). If we want explicit "already exists" feedback, we need to first check `customers.auth_user_id` server-side via admin client BEFORE calling signUp. Plan covers this.

4. **No password reset for orphan customers.** The "skip email on orphan recovery" behavior added in Phase B 1.0 becomes irrelevant — there are no temp passwords any more. The recovery-on-duplicate code path in `process-checkout.ts` should be removed; the new webhook never tries to create auth users.

5. **Welcome email sent to customer means they have a `customers` row with no auth account yet.** That's the new norm. The email's `accessLink` must lead to a sign-up flow, not assume an account exists.

6. **`accessLink` value.** Two options:
   - `https://www.910academy.com/account?purchase=success` — matches existing Stripe redirect URL. Middleware will redirect unsigned to /account/sign-up.
   - `https://www.910academy.com/account/sign-up` — direct to signup, skipping the middleware bounce.
   
   Going with **option 1** for consistency with the post-checkout redirect. One URL, one experience.

7. **Smoke test changes.** Must:
   - Assert `customers` row created (with `auth_user_id IS NULL`).
   - Assert `customer_products` row created with correct amount.
   - Assert **NO `auth.users` row** for the test email (key inversion from Phase B 1.0 which asserted auth-user existence).
   - Assert email `success: true`.
   - Cleanup: delete `customers` + cascade-deleted `customer_products`. **No auth users to delete** (none should exist).

8. **`outputFileTracingIncludes` in next.config.ts.** Currently set to `["./emails/**/*.html"]` for the webhook route — covers the new template too. No change needed.

## Files that will be touched (preview — exact diffs in plan.md)

| File | Action |
|---|---|
| `src/lib/webhook/process-checkout.ts` | rewrite — remove auth-user creation; upsert customer; link existing auth user if found by email; remove `tempPassword`/`wasNewUser` semantics; add `wasNewCustomer` |
| `src/lib/email/welcome.ts` | rename → `src/lib/email/purchase-confirmed.ts`; new placeholders `{productName, accessLink}`; new subject; new template path |
| `src/app/account/sign-up/page.tsx` | **new** — full name + email + password + confirm; calls signUp + server action to link |
| `src/app/account/sign-up/actions.ts` | **new** — `linkCustomerToAuthUser(email, authUserId)` server action using admin client |
| `src/app/account/login/page.tsx` | small edit — add "Create account" link |
| `src/app/account/page.tsx` | small edit — improve flash banner copy when `?purchase=success` (no functional change needed) |
| `middleware.ts` | small edit — add `/account/sign-up` to auth-pages; preserve `?purchase=success` query through redirect to sign-up |
| `scripts/smoke-test-webhook.ts` | rewrite — invert auth-user assertions; update import to renamed email lib; cleanup only customers + cps |
| `next.config.ts` | no change needed — `outputFileTracingIncludes: ["./emails/**/*.html"]` already covers the new template |
| `src/lib/email/welcome.ts` (old file) | **delete** after the new file is in place |

## Open questions to flag in plan, not blocking

- **Should sign-up require name as required field, or optional?** Spec says "full name, email, password, confirm password" — implying required. Plan: required, but trim/sanitize.
- **Confirm-password client-side validation only, or also server-side?** Plan: client-side only (mismatch is impossible to land at the server if client checks first; defense in depth would be cheap to add — will include both).
- **Show purchased product name on /account/sign-up post-checkout?** Spec doesn't say, but the email's productName is implicitly visible on the dashboard. Plan: a small "Just purchased? Use the email from your Stripe receipt." hint, no product name (we don't know which product on the sign-up page since we don't pass slug through the URL).
- **Server action vs API route for the linkage step?** Plan: server action — simpler, type-safe, no extra route file.
