# Phase E1.5 research — launch Four Horsemen as 2 products on a shared sales page

## Files & state

| Asset | Status |
|---|---|
| `public/_drafts/four-horsemen-workshop.html` | exists (1033 lines) — already structured as a two-part bundle |
| `public/products/lucid-horizon-workshop.html` | canonical reference for active product page |
| `public/products.html` | already has a `card-unavailable` placeholder for Four Horsemen at lines 271-281 |
| `public/og-images/four-horsemen-workshop.jpg` | **exists** (67 KB) |
| `public/og-images/four-horsemen-workshop.{png,webp}` | NOT present |
| `scripts/check-gated-pages.sh` | actively blocks the build if `public/products/four-horsemen-workshop.html` exists |
| `src/components/account/VideoViewer.tsx` | confirms `vimeoHash` is optional/nullable |
| `supabase/migrations/` | latest is `0005_…`; next free number is `0006` |

**OG image — no new images needed.** Other partner workshops (`lucid-horizon`, `jt-visuals`, `known-productions`) use only `.jpg`. The existing `four-horsemen-workshop.jpg` already matches that pattern. No `.webp`/`.png` siblings required for parity. The storefront card at line 272 already references `.jpg` only.

## `check-gated-pages.sh` — must be edited

Lines 7-9:
```bash
GATED_PAGES=(
  "public/products/four-horsemen-workshop.html"
)
```

If the file exists in `public/products/` while still listed in `GATED_PAGES`, the prebuild errors and `npm run build` fails. Removing `four-horsemen-workshop.html` from this array (or removing the array entirely if no other gated pages exist) is implicit in the launch — not optional.

## Existing draft sales page — already two-part shaped

Hero + trailer → 2-card "Choose Your Path" pricing → reels grid → Part 1 bullets → Part 2 bullets → instructor block → final CTA (mirrors choose-your-path) → FAQ. **No structural rework needed.** Just three substantive edits:

1. **4× Stripe URL replacement.** Two checkout buttons in `path-section` (lines 836, 845) and two in the final CTA mirror (lines 936, 942):

   | Old (placeholder URL in draft) | New (per Phase E1.5 brief) |
   |---|---|
   | `https://buy.stripe.com/4gMdR95GS1lYbwWdAa7bW0n` (Part 1, ×2) | `https://buy.stripe.com/00w3cublA9j0bWh0mj5Rm1B` |
   | `https://buy.stripe.com/28EdR9glw0hUdF42Vw7bW0o` (Part 2, ×2) | `https://buy.stripe.com/cNi9ASdtIeDk4tPb0X5Rm1C` |

2. **Nav patch to Phase B v4 state.** Current draft nav (lines 777-794) is pre-v4: no Sign In auth slot, no `data-join-cta`, no cookie-detection script. Three insertions match what the v3→v4 helper did for the other 18 pages:
   - Add `<a href="/account/login" class="nav-link nav-auth-link" data-auth-link data-state="logged-out">Sign In</a>` between Products and Join CTA in desktop nav.
   - Add `<a href="/account/login" data-auth-link data-state="logged-out">Sign In</a>` in mobile-nav.
   - Add `data-join-cta` to both Join CTAs.
   - Add the v4 dual-purpose cookie-detection script before `</body>`.

3. **OG meta tag.** Line 13 currently `<meta property="og:image" content="/images/og-image.jpg">` (broken — `/images/og-image.jpg` is not the right asset). Replace with `https://www.910academy.com/og-images/four-horsemen-workshop.jpg`. Also add `<meta name="twitter:card">` etc. and a `<link rel="canonical">` to match lucid-horizon's pattern. Cheap, but flagging as a small bonus that's strictly out-of-scope-of-the-spec; will be in plan.md as optional polish — flagging here, will default to **doing it** since lucid-horizon canonical structure is named in #3 of the brief.

## Storefront card — already exists, currently disabled

Lines 271-281 of `public/products.html`:

```html
<div class="card card-unavailable">
  <div class="card-image"><img src="/og-images/four-horsemen-workshop.jpg" alt="Four Horsemen Takeover" loading="lazy"></div>
  <div class="card-body">
    <p class="card-eyebrow">Workshop · Two parts</p>
    <h3 class="card-title">Four Horsemen Takeover</h3>
    <p class="card-desc">The most in-depth real estate media workshop we've shipped, covering both the business and the editing rooms.</p>
    <div class="card-foot">
      <span class="card-pill-muted">UNAVAILABLE</span>
    </div>
  </div>
</div>
```

To enable: change the wrapping element from `<div class="card card-unavailable">` to `<a href="/products/four-horsemen-workshop" class="card">`, swap the `<span class="card-pill-muted">UNAVAILABLE</span>` for the standard `<span class="card-price">$91 per part</span><span class="card-btn">View →</span>` cluster. The eyebrow ("Workshop · Two parts"), title ("Four Horsemen Takeover"), and description don't need to change. The `</div>` closing tag becomes `</a>`.

## VideoViewer hash assumption

Lines 13-14: `const qs = …; if (vimeoHash) qs.set("h", vimeoHash);` — hash is optional. NULL hash is fine when the Vimeo video is **public or unlisted**. Both Four Horsemen videos must be in one of those privacy states for null-hash playback to work. Plan flags this as a confirmation item.

## Schema column-name mismatch in brief

Brief says `name: "Four Horsemen — Part 1"` but the actual column is `title` (per `0001_init_products_schema.sql`). Migration uses `title`.

## Resource type vs. `product_videos` — brief is contradictory

Brief #1 says `resource_type: video` for both products. Brief #2 says insert `product_videos` rows.

But the gated viewer at `src/app/account/(authed)/products/[slug]/page.tsx` only consults `product_videos` when `resource_type === 'multi'`. For `resource_type === 'video'`, it reads `products.vimeo_id` and `products.vimeo_hash` directly:

```ts
let videos: ProductVideo[] = [];
if (resourceType === "multi") {
  const { data } = await supabase.from("product_videos").select(...).eq("product_id", product.id)...;
  videos = (data as ProductVideo[] | null) ?? [];
}

// ...later:
{resourceType === "video" && product.vimeo_id && (
  <VideoViewer vimeoId={product.vimeo_id} vimeoHash={product.vimeo_hash} title={product.title} />
)}
```

Three options:

- **(a)** `resource_type='video'`, populate `products.vimeo_id` + `vimeo_hash`, **skip product_videos**. Cleanest for single-video products. Matches the lucid-horizon / jt-visuals pattern. Requires the user to set Vimeo videos public/unlisted or supply hashes.
- **(b)** `resource_type='multi'`, populate `product_videos` (single row per product), set `products.vimeo_id=null`. This is the IG Masterclass pattern. Wastes a multi-video viewer UI on a single-video product.
- **(c)** Both. `resource_type='video'`, populate `products.vimeo_id`, ALSO insert `product_videos` rows for future "multi" flexibility. Dead data today; viewer ignores `product_videos`.

**Plan recommends (a)** as the natural fit. Single-video products use `products.vimeo_id` per existing convention. We'll surface this as a decision point at the gate.

## product_videos schema confirm

From migration `0003_add_product_videos.sql`:

```sql
create table product_videos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  vimeo_id text not null,
  vimeo_hash text,
  display_order int default 0,
  title text,
  description text,
  unique(product_id, display_order)
);
```

If we go with option (b) or (c), each product needs `display_order=1` (or 0). Unique-key constraint on `(product_id, display_order)` — fine for single rows.

## Files to touch — preview

| File | Action |
|---|---|
| `supabase/migrations/0006_four_horsemen_products.sql` | new — `INSERT ... ON CONFLICT (slug) DO UPDATE` for both products |
| `public/_drafts/four-horsemen-workshop.html` → `public/products/four-horsemen-workshop.html` | `git mv` |
| `public/products/four-horsemen-workshop.html` | edit — 4× Stripe URL update, nav patch, OG fix |
| `public/products.html` | edit — convert card-unavailable to active link card |
| `scripts/check-gated-pages.sh` | edit — remove `four-horsemen-workshop.html` from `GATED_PAGES` |

**No changes to**: `process-checkout.ts`, `route.ts`, smoke test, email templates, customers schema, `/account/*` URLs.

## Migration application path

Brief says: "Apply via supabase db push OR direct SQL editor — surface in plan.md which path you prefer."

The repo does not have a Supabase CLI workflow set up (no `supabase` package in `package.json`, no `supabase/.config.toml` with linked project). All prior schema changes were applied manually via SQL editor or directly via the admin client during the InstaMC seed. **Plan recommends**: apply the migration by running the SQL directly via the admin client from a local script (like the InstaMC seed work — same pattern). Idempotent; safe to re-run.

Alternative: paste SQL into the Supabase dashboard SQL editor — also fine; user preference. Plan will pick admin-client-from-local-script as default unless user pushes back.

## Risks / soft warnings

1. **Vimeo privacy state**: NULL hash requires both videos to be public OR unlisted on Vimeo. If they're private with hash-required, we need the hashes — surface to user before executing.
2. **OG meta polish**: technically out of strict scope of brief but the brief says "Match the visual structure of lucid-horizon for header, hero, body sections" — interpreting "header" as page hero, not HTML `<head>`. Plan defaults to keeping the OG meta minimal-correct (just fix the broken `/images/og-image.jpg` reference) without going as deep as lucid-horizon's full og/twitter/canonical block. If you want full parity, say so.
3. **Storefront card eyebrow** currently reads "Workshop · Two parts". Keeping as-is. If you want it to say something like "Workshop · 2 parts · $91 each", say so.
4. **No homepage edit**. Brief says don't bundle. The Four Horsemen workshop is not currently surfaced on the homepage; it stays that way.
5. **Stripe payment link sanity**: assumed both new plinks are configured to redirect post-purchase to `/account?purchase=success` (matching the other 7 plinks). If not, the purchase flow will land users on a Stripe-hosted thank-you page; webhook still fires correctly. Out of scope to verify here — flagging.
