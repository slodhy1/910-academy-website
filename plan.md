# Phase E1.5 plan — launch Four Horsemen as 2 products on shared sales page

Diff-level precision. No file outside this list will be touched.

---

## Decisions baked in (defaults — push back if any disagrees)

1. **Resource model**: `resource_type='video'`, populate `products.vimeo_id` directly, **skip product_videos rows**. Single-video products fit the `video` viewer path; product_videos rows would be dead data.
2. **Migration apply path**: run the SQL via a one-off local Node script using the admin client (same pattern as past InstaMC seed). Not `supabase db push` (CLI not configured). Idempotent via `ON CONFLICT (slug) DO UPDATE`.
3. **OG meta**: fix the one broken `/images/og-image.jpg` reference. Don't expand to full lucid-horizon parity (canonical, twitter card, etc.) — out of strict scope; revisit if you want polish later.
4. **Storefront card text**: keep "Workshop · Two parts" eyebrow + existing title + existing description verbatim. Convert wrapper from `<div class="card card-unavailable">` to `<a href="/products/four-horsemen-workshop" class="card">`. Replace the `card-pill-muted "UNAVAILABLE"` with `card-price "$91 per part"` + `card-btn "View →"`.
5. **No new OG images**. The existing `.jpg` matches the partner-workshop convention.
6. **Vimeo hash NULL** for both products. **Pre-execute confirmation needed**: both videos must be public OR unlisted on Vimeo. If they're private with hash-required, plan will fail at viewer time. Surface at the gate.

---

## Change 1 — `supabase/migrations/0006_four_horsemen_products.sql` (new)

Idempotent. Run via local admin-client script (Change 6 below).

```sql
-- Phase E1.5: Four Horsemen — Part 1 + Part 2 (shared sales page).
-- Idempotent. Apply via Supabase admin client or SQL editor.

insert into public.products (
  slug, title, short_description, long_description,
  price_cents, vimeo_id, vimeo_hash,
  thumbnail_url, stripe_payment_link, stripe_payment_link_id,
  resource_type, status
) values
  (
    'four-horsemen-part-1',
    'Four Horsemen — Part 1',
    'The business playbook behind a seven-figure real estate media company.',
    'Part 1 of the Four Horsemen workshop. Pricing, sales scripts, scaling beyond yourself, and the systems behind a seven-figure real estate media company. Designed for operators who want a real business, not a side hustle.',
    9100,
    '1167927978',
    null,
    '/og-images/four-horsemen-workshop.jpg',
    'https://buy.stripe.com/00w3cublA9j0bWh0mj5Rm1B',
    'plink_1TUFAsBgZ35gA9jqLaeS67Ob',
    'video',
    'active'
  ),
  (
    'four-horsemen-part-2',
    'Four Horsemen — Part 2',
    'The post-production system that powers the Four Horsemen feed.',
    'Part 2 of the Four Horsemen workshop. The editing room: transitions, sound design, color, and the post-production system Four Horsemen use to ship work that lands at the top of the feed every time.',
    9100,
    '1172242879',
    null,
    '/og-images/four-horsemen-workshop.jpg',
    'https://buy.stripe.com/cNi9ASdtIeDk4tPb0X5Rm1C',
    'plink_1TUFBlBgZ35gA9jqsEBVmujH',
    'video',
    'active'
  )
on conflict (slug) do update set
  title = excluded.title,
  short_description = excluded.short_description,
  long_description = excluded.long_description,
  price_cents = excluded.price_cents,
  vimeo_id = excluded.vimeo_id,
  vimeo_hash = excluded.vimeo_hash,
  thumbnail_url = excluded.thumbnail_url,
  stripe_payment_link = excluded.stripe_payment_link,
  stripe_payment_link_id = excluded.stripe_payment_link_id,
  resource_type = excluded.resource_type,
  status = excluded.status;
```

(Single multi-row INSERT for clarity. `ON CONFLICT (slug)` handles re-runs cleanly. `excluded.*` references the would-have-inserted values.)

---

## Change 2 — `git mv` the draft to `public/products/`

```bash
git mv public/_drafts/four-horsemen-workshop.html public/products/four-horsemen-workshop.html
```

Single rename. Git preserves history.

---

## Change 3 — Edit `public/products/four-horsemen-workshop.html` (the moved file)

### 3a — Stripe URL replacement (4 occurrences)

```diff
-href="https://buy.stripe.com/4gMdR95GS1lYbwWdAa7bW0n"
+href="https://buy.stripe.com/00w3cublA9j0bWh0mj5Rm1B"
```
(replace_all — affects 2 buttons: lines ~836 and ~936)

```diff
-href="https://buy.stripe.com/28EdR9glw0hUdF42Vw7bW0o"
+href="https://buy.stripe.com/cNi9ASdtIeDk4tPb0X5Rm1C"
```
(replace_all — affects 2 buttons: lines ~845 and ~942)

### 3b — Desktop nav: insert Sign In auth slot + tag Join CTA

```diff
       <a href="/products" class="nav-link">Products</a>
+      <a href="/account/login" class="nav-link nav-auth-link" data-auth-link data-state="logged-out">Sign In</a>
-      <a href="https://www.skool.com/910-academy/about" target="_blank" rel="noopener noreferrer" class="nav-cta">Join 910 Academy</a>
+      <a href="https://www.skool.com/910-academy/about" target="_blank" rel="noopener noreferrer" class="nav-cta" data-join-cta>Join 910 Academy</a>
```

### 3c — Mobile nav: insert Sign In + tag mobile Join CTA

```diff
   <a href="/products">Products</a>
+  <a href="/account/login" data-auth-link data-state="logged-out">Sign In</a>
-  <a href="https://www.skool.com/910-academy/about" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Join 910 Academy</a>
+  <a href="https://www.skool.com/910-academy/about" target="_blank" rel="noopener noreferrer" style="color:var(--accent);" data-join-cta>Join 910 Academy</a>
```

### 3d — Insert v4 cookie-detection script before `</body>`

Add as a separate `<script>` block immediately before `</body>` (the existing scripts for nav-scroll, mobile-nav, and FAQ stay above it):

```html
<script>
(function(){
  try {
    var hasSession = document.cookie.indexOf("sb-qkmkxthpeapuecobahhx-auth-token") !== -1;
    var authLinks = document.querySelectorAll("[data-auth-link]");
    if (hasSession) {
      authLinks.forEach(function(el){
        el.setAttribute("href", "/account");
        el.setAttribute("data-state", "logged-in");
        el.textContent = "My Account";
      });
      var joinCtas = document.querySelectorAll("[data-join-cta]");
      joinCtas.forEach(function(el){ el.style.display = "none"; });
    }
  } catch (e) { /* no-op */ }
})();
</script>
```

### 3e — Fix broken OG image meta (single line)

```diff
-<meta property="og:image" content="/images/og-image.jpg">
+<meta property="og:image" content="https://www.910academy.com/og-images/four-horsemen-workshop.jpg">
```

(One narrow fix; not expanding to full canonical/twitter parity — out of strict scope.)

---

## Change 4 — Edit `public/products.html` storefront card

Replace the `card-unavailable` block (lines 271-281) with an active link card:

```diff
-      <div class="card card-unavailable">
-        <div class="card-image"><img src="/og-images/four-horsemen-workshop.jpg" alt="Four Horsemen Takeover" loading="lazy"></div>
-        <div class="card-body">
-          <p class="card-eyebrow">Workshop · Two parts</p>
-          <h3 class="card-title">Four Horsemen Takeover</h3>
-          <p class="card-desc">The most in-depth real estate media workshop we've shipped, covering both the business and the editing rooms.</p>
-          <div class="card-foot">
-            <span class="card-pill-muted">UNAVAILABLE</span>
-          </div>
-        </div>
-      </div>
+      <a href="/products/four-horsemen-workshop" class="card">
+        <div class="card-image"><img src="/og-images/four-horsemen-workshop.jpg" alt="Four Horsemen Takeover" loading="lazy"></div>
+        <div class="card-body">
+          <p class="card-eyebrow">Workshop · Two parts</p>
+          <h3 class="card-title">Four Horsemen Takeover</h3>
+          <p class="card-desc">The most in-depth real estate media workshop we've shipped, covering both the business and the editing rooms.</p>
+          <div class="card-foot">
+            <span class="card-price">$91 per part</span>
+            <span class="card-btn">View →</span>
+          </div>
+        </div>
+      </a>
```

(Per brief: card price label is "$91 per part" — surfaces the two-part structure clearly.)

---

## Change 5 — Edit `scripts/check-gated-pages.sh`

Remove `four-horsemen-workshop.html` from the GATED_PAGES array. Keep the script structure for future gated pages:

```diff
 GATED_PAGES=(
-  "public/products/four-horsemen-workshop.html"
 )
```

If `GATED_PAGES` becomes empty, the loop body never executes and the script prints "All gated pages confirmed in _drafts/. Safe to deploy." regardless. Acceptable.

---

## Change 6 — Apply migration via local Node script

```bash
cat > /tmp/apply-fh-migration.mjs <<'EOF'
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sql = readFileSync("supabase/migrations/0006_four_horsemen_products.sql", "utf-8");
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Supabase admin client doesn't expose raw SQL execution directly via the JS SDK;
// we use the REST .rpc() to a built-in 'execute_sql' or fall back to a single
// upsert per row using .from('products').upsert(...).
//
// For idempotent product insertion, build the rows in JS and use the `.upsert`
// method with onConflict='slug'.
const rows = [
  {
    slug: "four-horsemen-part-1",
    title: "Four Horsemen — Part 1",
    short_description: "The business playbook behind a seven-figure real estate media company.",
    long_description: "Part 1 of the Four Horsemen workshop. Pricing, sales scripts, scaling beyond yourself, and the systems behind a seven-figure real estate media company. Designed for operators who want a real business, not a side hustle.",
    price_cents: 9100,
    vimeo_id: "1167927978",
    vimeo_hash: null,
    thumbnail_url: "/og-images/four-horsemen-workshop.jpg",
    stripe_payment_link: "https://buy.stripe.com/00w3cublA9j0bWh0mj5Rm1B",
    stripe_payment_link_id: "plink_1TUFAsBgZ35gA9jqLaeS67Ob",
    resource_type: "video",
    status: "active",
  },
  {
    slug: "four-horsemen-part-2",
    title: "Four Horsemen — Part 2",
    short_description: "The post-production system that powers the Four Horsemen feed.",
    long_description: "Part 2 of the Four Horsemen workshop. The editing room: transitions, sound design, color, and the post-production system Four Horsemen use to ship work that lands at the top of the feed every time.",
    price_cents: 9100,
    vimeo_id: "1172242879",
    vimeo_hash: null,
    thumbnail_url: "/og-images/four-horsemen-workshop.jpg",
    stripe_payment_link: "https://buy.stripe.com/cNi9ASdtIeDk4tPb0X5Rm1C",
    stripe_payment_link_id: "plink_1TUFBlBgZ35gA9jqsEBVmujH",
    resource_type: "video",
    status: "active",
  },
];

const { error } = await sb.from("products").upsert(rows, { onConflict: "slug" });
if (error) { console.error("upsert failed:", error); process.exit(1); }
console.log("Upserted both Four Horsemen rows.");

// Sanity SELECT
const { data } = await sb.from("products")
  .select("slug,title,status,price_cents,stripe_payment_link_id,resource_type")
  .in("slug", ["four-horsemen-part-1", "four-horsemen-part-2"])
  .order("slug");
console.table(data);
EOF
node --env-file=.env.local /tmp/apply-fh-migration.mjs
rm /tmp/apply-fh-migration.mjs
```

The migration **SQL file** still gets committed for posterity / re-run via SQL editor; the Node script applies it via the equivalent `.upsert()` call. Both produce the same on-disk state. SQL file is the durable artifact; script is one-shot.

---

## Order of operations in execute step

1. Create `supabase/migrations/0006_four_horsemen_products.sql`.
2. `git mv` draft → `public/products/four-horsemen-workshop.html`.
3. Edit moved file: 4× Stripe URL update, nav patch (desktop + mobile + script), OG image fix.
4. Edit `public/products.html`: convert card.
5. Edit `scripts/check-gated-pages.sh`: remove from array.
6. Run `/tmp/apply-fh-migration.mjs` against prod Supabase. Print sanity SELECT.
7. `npm run build` — must pass clean.
8. STOP for "deploy".

---

## Files explicitly NOT touched

- `src/lib/webhook/process-checkout.ts`, `src/app/api/stripe-webhook/route.ts` — webhook untouched.
- `emails/*.html` — untouched.
- `scripts/smoke-test-webhook.ts` — untouched.
- `customers` schema — no changes.
- `public/index.html`, `public/products/*.html` (the other 7), `src/app/account/*` — out of scope.
- `vercel.json`, `next.config.ts`, `middleware.ts` — out of scope.

---

## Risks / soft warnings

1. **Vimeo privacy state** — both videos must be public/unlisted, OR you provide hashes before launch. Surface at gate.
2. **The two new Stripe payment links** must be configured to redirect post-purchase to `/account?purchase=success`. Plan assumes they are; if not, real-purchase flow still grants access (webhook handles it) but post-checkout UX lands on a Stripe-hosted thank-you page.
3. **Storefront card description** still reads "covering both the business and the editing rooms" — accurate for the two-part structure. No change.
4. **`scripts/check-gated-pages.sh` empty array**: future gated pages can re-add entries. The empty-array form prints the success message regardless — acceptable.
5. **OG meta minimal fix**: doing one narrow fix (`/images/og-image.jpg` → correct path). Not expanding to canonical/twitter card parity. If you want full parity, push back.

---

## Stop point

Execute does NOT begin until user replies "go".
