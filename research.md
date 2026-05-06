# Phase B research — webhook bug fixes + welcome email + smoke test

## Preconditions
- `emails/welcome-email.html` — present (137 lines, 5124 B). Uses placeholders `{{productName}}`, `{{email}}`, `{{tempPassword}}`, `{{loginLink}}` — matches spec exactly.
- `emails/migration-email.html` — present (137 lines, 5238 B).
- `emails/password-reset-email.html` — present (114 lines, 3889 B).

(Migration + password-reset templates are not consumed by Phase B but are required-existing.)

## Current webhook flow — `src/app/api/stripe-webhook/route.ts` (132 lines)

| Step | Lines | Behavior |
|---|---|---|
| Env check | 8-10 | requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Stripe client init | 11 | new Stripe instance per request |
| Read body + sig | 13-15 | `req.text()` + `stripe-signature` header |
| Verify signature | 17-23 | `stripe.webhooks.constructEvent` — returns 400 on mismatch |
| Filter event type | 25-27 | non-`checkout.session.completed` → 200 ignored |
| Extract email | 29-34 | `customer_details.email` ?? `customer_email`; missing → 200 warn |
| Resolve product slug | 38-63 | metadata first, then plink lookup; no match → 200 warn |
| Load product row | 67-75 | by slug; missing → 200 warn |
| Find/create customer | 77-117 | **two bugs live here** |
| Upsert customer_products | 119-129 | idempotent on `(customer_id, product_id)` |
| Return | 131 | `{ ok: true }` 200 |

## Bug locations (exact)

### Bug 1 — Math.random temp password
- **Line 88**: `const tempPassword = Math.random().toString(36).slice(-12) + "A1!";`
- Replacement per spec: `crypto.randomBytes(12).toString('base64url').slice(0, 16)`
- Need: `import { randomBytes } from "crypto";` at top (currently no `crypto` import).

### Bug 2 — orphaned auth user retry loop
- **Lines 89-93**: `auth.admin.createUser` called; on success, `authData.user.id` used.
- **Line 96**: `if (authErr || !authData?.user) return 500` — Stripe retries on 5xx.
- **Lines 100-113**: `customers` insert. On error → return 500 (line 112). Auth user already created at this point → orphaned.
- **Failure mode**: retry → `createUser` errors with email-exists → return 500 → infinite retry. Customer paid; never gets row in `customers`.
- Fix path: catch `createUser` error, detect "email exists" via `error.code === 'email_exists'` OR `status === 422` OR `message.includes('already')`, look up user via `auth.admin.listUsers()` filtered to email, take match, continue. Same recovery applies if `createUser` *succeeded* this run but on a retry: existing branch (line 85, looking up `customers` row by email) wouldn't have inserted yet — so we'd hit createUser again, get email-exists, and we want to recover by listing.

### Where `wasNewUser` is determined
- True when we just (a) called `createUser` successfully OR (b) looked up an existing auth user AND no `customers` row was found at line 78. Practically: `wasNewUser = (existing row in customers was NOT found at line 78)`. The auth user may have been pre-existing (orphan) but if `customers` is fresh, this is still effectively a first-grant for our system → send welcome email.

### Email injection point
- After line 129 (customer_products upsert succeeds), before line 131. Conditional on `wasNewUser === true`. Fire-and-await but never throw; log on failure; return 200 regardless.

## Library files reviewed

- `src/lib/supabase/admin.ts` (10 lines): factory `createAdminClient()` returning service-role client with `persistSession: false, autoRefreshToken: false`. Suitable for both webhook + smoke test. Reuse as-is.
- `src/lib/supabase/server.ts` (28 lines): SSR cookies-bound anon client — not used by webhook or smoke test.
- `src/lib/supabase/` also has `client.ts` and `storage.ts` (untouched by this plan).

## next.config.ts

42 lines. Single export, contains `rewrites()` only. No existing `outputFileTracingIncludes`. Safe to add the key; need to preserve `rewrites()` and the `STATIC_PAGES` array verbatim.

Per Next 15 docs, `outputFileTracingIncludes` is a top-level `NextConfig` key, value is `Record<string, string[]>` keyed by route file path (relative to repo root). Spec value is fine:
```ts
outputFileTracingIncludes: {
  'src/app/api/stripe-webhook/route.ts': ['./emails/**/*.html'],
}
```

## package.json

```
deps: next ^15.1.0, react ^19.0.0, react-dom ^19.0.0,
      @supabase/supabase-js ^2.45.0, @supabase/ssr ^0.5.0,
      stripe ^17.0.0
devDeps: typescript ^5, @types/node ^22, @types/react ^19, @types/react-dom ^19
```

**Missing dep:** `resend` — install per spec.
**Smoke test runner:** `tsx` not installed. Spec says `npx tsx scripts/smoke-test-webhook.ts` — `npx` will fetch + cache it on demand (no need to add to package.json devDeps unless we want pinned). Not adding unless prompted.

Installed Next is `15.5.15`. Node `24.14.0`. Resend SDK current version supports Node ≥18; compatible.

## Edge cases & assumptions to flag

1. **`auth.admin.listUsers` does not support a server-side email filter** in `@supabase/supabase-js@2.x` per the SDK signature `listUsers({ page?, perPage? })`. Workaround: paginate and filter client-side. For our use case (webhook + smoke test, low frequency), `listUsers({ perPage: 200 })` and `find(u => u.email === email)` is acceptable. If user count exceeds page size it will silently miss — but at our scale (single-digit thousands max) one page is fine. Flagging for review. Alternative: use `auth.admin.getUserByEmail()` if available in the installed SDK version — need to verify 2.45.0 ships it; older versions don't.

2. **`process.cwd()` at runtime on Vercel.** Next.js Functions execute from the bundle root. `path.join(process.cwd(), 'emails/welcome-email.html')` resolves to whatever Vercel sets as cwd (typically `/var/task/`). With `outputFileTracingIncludes` the file is bundled into the function output and accessible at this path. Verified pattern used in many Next deployments. No change needed beyond the config addition.

3. **EMAIL_FROM domain verification.** `academy@studio910pb.com` — Resend requires `studio910pb.com` to have its DNS records (SPF, DKIM, DMARC) verified in the Resend dashboard. If not yet verified, Resend SDK calls return a 403 with `validation_error`. Smoke test will detect this. Surfacing here so user knows to verify before deploy.

4. **Smoke test recipients.** Per spec: `slodhy1+webhook-test-{slug}@gmail.com` (Gmail plus-aliasing). 7 emails will land in `slodhy1@gmail.com` inbox. Acceptable per user direction.

5. **Smoke test side effects on prod DB.** Will create 7 `auth.users` + 7 `customers` + 7 `customer_products` rows. Cleanup script handles `customers` + `customer_products` (cascade-deletes `customer_products`). Auth users require dashboard deletion — printed link.

6. **Smoke test runs against PROD.** `.env.local` points at `qkmkxthpeapuecobahhx`. No staging Supabase. The `slodhy1+webhook-test-*@gmail.com` namespace makes them easy to filter post-run.

7. **`event.id` not used for idempotency.** Outside scope of the six changes — flagging as a future hardening, not fixing here.

8. **Existing `wasNewUser` is not currently tracked.** We need to add a local `let wasNewUser = false` and set it true on the create-or-recover branch. Existing customer (line 85 `if (existing)`) leaves it false.

9. **`processCheckoutCompleted` return type.** Spec: `{ success: boolean; customerId?: string; wasNewUser?: boolean; error?: string }`. The POST handler will inspect `success` and return 500 only on internal failures (auth-create that's not duplicate, customers insert failure with no recovery, customer_products upsert error). 200 on success or no-op (no email, no product match, etc — preserving current behavior).

10. **Email send timing.** Sent inside `processCheckoutCompleted` after `customer_products` upsert. Returns from the function regardless of email outcome. Smoke test inspects email-result from the same function call.

## Files to modify or create — preview (full diffs in plan.md)

| File | Action |
|---|---|
| `src/app/api/stripe-webhook/route.ts` | modify — bugs 1+2, refactor + export `processCheckoutCompleted`, call email |
| `src/lib/email/welcome.ts` | create — `sendWelcomeEmail` |
| `next.config.ts` | modify — add `outputFileTracingIncludes` |
| `scripts/smoke-test-webhook.ts` | create |
| `package.json` + `package-lock.json` | modify — add `resend` |
| `.env.local` | user adds `RESEND_API_KEY` + `EMAIL_FROM` for smoke test |

No other files touched.

## Open items requiring user decision

None blocking. The spec is precise enough to write the plan. One soft item: the `listUsers` pagination caveat in #1 above — flagging in case user wants pagination, but the simple single-page implementation is what plan.md will specify unless objected.
