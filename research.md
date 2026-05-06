# Phase B v4 research — layout separation auth/portal + marketing nav refactor

## Preconditions
- All 18 static HTML files in `public/` have v3 Account link + cookie-detection script. Verified: each file has 3× `data-account-link` (desktop nav + mobile-nav + script's `querySelectorAll`) and 1× `sb-qkmkxthpeapuecobahhx-auth-token` (cookie name in script). ✅

---

## Current `/account/*` layout inheritance

Single `src/app/account/layout.tsx` wraps **everything** under `/account`. 45 lines, contains:
- `<nav class="acct-nav">` with logo + 3 links (Home, Account, Settings) — visible to ALL `/account/*` pages including login/sign-up/forgot/reset.
- `<main class="acct-main">` with top padding for the fixed nav.
- `<footer class="acct-footer">` with logo + copyright.
- All styles in a `<style>` block at the bottom.

**Bug**: unauth users on `/account/login` see the "Home / Account / Settings" links rendered above the form. The user clicks "Account" → middleware redirects back to login → confused state.

**Fix**: route groups. Move auth pages into `(auth)`, authed pages into `(authed)`, give each its own layout. URLs unchanged because `()` route groups are URL-invisible.

---

## Files in `src/app/account/` (current tree)

| File | Lines | Audience | Goes into |
|---|---|---|---|
| `layout.tsx` | 45 | both | **delete** |
| `logout-button.tsx` | 23 | authed | shared, no move |
| `login/page.tsx` | 88 | unauth | `(auth)/login/page.tsx` |
| `sign-up/page.tsx` | 173 | unauth | `(auth)/sign-up/page.tsx` |
| `sign-up/actions.ts` | 75 | unauth | `(auth)/sign-up/actions.ts` |
| `forgot-password/page.tsx` | 79 | unauth | `(auth)/forgot-password/page.tsx` |
| `reset-password/page.tsx` | 88 | unauth (via Supabase email link) | `(auth)/reset-password/page.tsx` |
| `page.tsx` | 122 | authed | `(authed)/page.tsx` |
| `settings/page.tsx` | 56 | authed | `(authed)/settings/page.tsx` |
| `settings/forms.tsx` | 226 | authed | `(authed)/settings/forms.tsx` |
| `products/[slug]/page.tsx` | 199 | authed | `(authed)/products/[slug]/page.tsx` |
| `products/[slug]/not-found.tsx` | (small) | authed | `(authed)/products/[slug]/not-found.tsx` |

Imports relative to current `account/` folder (e.g. `../logout-button`) need updating after the move because the depth changes (`(authed)/page.tsx` → `../logout-button`).

`logout-button.tsx` stays at `src/app/account/logout-button.tsx`. From `(authed)/page.tsx` the import path becomes `../logout-button` (route groups don't add a path segment, but the FOLDER nesting is real, so depth stays the same). Confirmed: route group folders DO add a real folder layer in the filesystem; URL routing skips them but file resolution does not. Verified against Next.js 15 docs.

So:
- `account/(authed)/page.tsx` → `../logout-button` resolves to `account/logout-button.tsx` ✅
- `account/(authed)/settings/page.tsx` → `../../logout-button` ✅
- `account/(authed)/products/[slug]/page.tsx` → `../../../logout-button` ✅

(Same depth shift as before since route groups count as one folder.)

---

## Reusable client-side bits the new (auth) layout needs

The auth pages already use a self-contained `auth-card` style block in each page's `<style>` element. The new (auth) layout doesn't need to know about those — it just provides the page chrome (centered logo + footer link).

The `auth-card` styling currently relies on CSS vars set in some root global stylesheet (e.g. `--bg-base`, `--accent`, `--border`, `--radius-sm`, `--font`). Those vars are defined in… let me check.

```bash
$ grep -rln "^:root\|--bg-base\|--accent" src/app/globals.css 2>/dev/null
```

We'll verify this in execute step. If they're in `src/app/globals.css`, they apply globally and both new layouts inherit them.

---

## Route-group structure (target)

```
src/app/account/
├── logout-button.tsx                    (no move — shared by authed)
├── (auth)/
│   ├── layout.tsx                       (NEW — minimal centered)
│   ├── login/page.tsx                   (move from account/login)
│   ├── sign-up/
│   │   ├── page.tsx
│   │   └── actions.ts
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
└── (authed)/
    ├── layout.tsx                       (NEW — portal shell)
    ├── page.tsx                         (move from account/page.tsx)
    ├── settings/
    │   ├── page.tsx
    │   └── forms.tsx
    └── products/[slug]/
        ├── page.tsx
        └── not-found.tsx
```

The old `src/app/account/layout.tsx` is deleted.

`middleware.ts` matcher `/account/:path*` is unaffected — route groups are URL-invisible. The existing isAuthPage / purchase-success redirect logic continues to work as-is.

---

## Marketing nav — current Phase B v3 state

Per file (all 18 same shape, with toolkit.html and maintenance.html having minor variants):

```html
<!-- Sticky Nav — line ~704 in product pages, ~2137 in index, etc. -->
<nav class="nav" id="nav">
  <div class="nav-inner">
    <a href="/" class="nav-logo">
      <img src="/logo-white.svg" alt="910 Academy" width="36" height="36" decoding="async">
    </a>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/gear" class="nav-link">Our Gear</a>
      <a href="/products" class="nav-link">Products</a>     <!-- /maintenance in maintenance.html -->
      <a href="/account" class="nav-link" data-account-link>Account</a>     <!-- v3 added -->
      <a href="https://www.skool.com/910-academy/about" target="_blank" rel="noopener noreferrer" class="nav-cta">Join 910 Academy</a>
    </div>
    <button class="nav-mobile-toggle" id="mobileToggle">…</button>
  </div>
</nav>

<!-- Mobile nav -->
<div class="mobile-nav" id="mobileNav">
  <button class="mobile-nav-close">…</button>
  <a href="/">Home</a>
  <a href="/gear">Our Gear</a>
  <a href="/products">Products</a>     <!-- /maintenance in maintenance.html -->
  <a href="/account" data-account-link>Account</a>     <!-- v3 added; toolkit has class="mobile-nav-link" -->
  <a href="https://www.skool.com/910-academy/about" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Join 910 Academy</a>
</div>

<!-- before </body> -->
<script>
(function(){
  try {
    var hasSession = document.cookie.indexOf("sb-qkmkxthpeapuecobahhx-auth-token") !== -1;
    if (!hasSession) {
      var els = document.querySelectorAll("[data-account-link]");
      els.forEach(function(el){ el.setAttribute("href", "/account/login"); });
    }
  } catch (e) { /* no-op */ }
})();
</script>
```

**What needs to change** in each file:

1. **Remove the v3 inline Account links** (desktop + mobile, both `data-account-link`).
2. **Add a Sign In auth slot** (default state) in the same place — desktop `class="nav-link nav-auth-link" data-auth-link data-state="logged-out"`; mobile uses appropriate class (toolkit gets `mobile-nav-link`).
3. **Add `data-join-cta` attribute** to both desktop and mobile "Join 910 Academy" links so the script can hide them when logged in.
4. **Replace the cookie-detection script** with the new richer version that toggles BOTH the auth-link state AND the join-cta visibility.

The brief says "REMOVE the existing inline 'Account' link from .nav-links and .mobile-nav (where Phase B v3 added them)" and "ADD a right-aligned auth slot in the nav, BEFORE the 'Join 910 Academy' CTA button". So slot position remains where the v3 link was (between Products and Join CTA). The right-alignment piece is achieved via `margin-left: auto` on `.nav-auth-link` in the desktop nav — it pushes the "Sign In" / "My Account" element to the right of the flex container, leaving the Join CTA after it. Wait — that's a layout question. Let me re-read.

"ADD a right-aligned auth slot in the nav, BEFORE the 'Join 910 Academy' CTA button"

Two reasonable interpretations:
- (a) `Sign In` sits immediately to the LEFT of `Join 910 Academy`, both right-aligned at the end of the flex. (Same DOM order as v3, just a stylistic right-side cluster.)
- (b) `Sign In` is right-aligned to the far right and `Join 910 Academy` sits before it.

Brief literally says "right-aligned … BEFORE the Join 910 Academy CTA". So the auth link is BEFORE the CTA in DOM but still right-aligned. The current `.nav-links` is a flex with `gap: 36px` and the whole `.nav-inner` is `justify-content: space-between` — so logo on left, the entire `nav-links` cluster (Home / Gear / Products / Sign In / Join CTA) is on the right.

Interpretation (a) is what we have now: Sign In sits between Products and Join CTA, both at the right edge of the page. The v3 layout already produced this. The "right-aligned" wording is satisfied by the existing flex right-cluster.

**No layout change to `.nav-links` flex needed**. Just swap "Account" for "Sign In" with the new attributes + the new CSS class. The brief's CSS section (#3) specifies `nav-auth-link` matches existing `nav-link` styling — so no new visual rules are strictly required, but a class hook is added for future variations.

---

## CSS for `nav-auth-link`

Current `.nav-link` definition (sample from index.html line 252-270):

```css
.nav-link {
  font-size: 13px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg-muted);
  transition: color 0.3s var(--ease-smooth); position: relative;
}
.nav-link::after { content: ''; position: absolute; bottom: -4px; left: 0;
  width: 0; height: 1px; background: var(--fg);
  transition: width 0.3s var(--ease-out); }
.nav-link:hover { color: var(--fg); }
.nav-link:hover::after { width: 100%; }
```

For `nav-auth-link`: the brief says match existing styling. Since `<a class="nav-link nav-auth-link">` already gets the `.nav-link` rules, no per-state CSS is required. The `data-state` attribute can drive visual variation later if desired — for now, both states render identically per spec point #3 ("don't try to make it a button — let the visual hierarchy stay clean").

Per-file CSS additions: **none required**. The `nav-auth-link` class can be omitted entirely if we don't add any new rules — but the brief specifies adding it as a class hook. We'll include it as a no-op class for now (minor).

Actually re-reading: "CSS for the new nav-auth-link class … Match existing nav-link styling." — implies add the class but don't add new rules. Empty rule set, or inherit only. The cleanest implementation is to NOT add new CSS rules and rely on `.nav-link` (which is shared via `class="nav-link nav-auth-link"`). Plan will note this.

---

## New cookie-detection script (target)

```js
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
    // Logged-out path: defaults are already correct (Sign In + visible Join CTA).
  } catch (e) { /* no-op */ }
})();
```

`element.textContent = "My Account"` replaces the inner text without removing/adding child nodes (the link is just text — works cleanly).

---

## Files to touch — preview

| File | Action |
|---|---|
| `src/app/account/layout.tsx` | **delete** (replaced by two new layouts) |
| `src/app/account/(auth)/layout.tsx` | **new** |
| `src/app/account/(authed)/layout.tsx` | **new** |
| `src/app/account/login/` → `src/app/account/(auth)/login/` | git mv |
| `src/app/account/sign-up/` → `src/app/account/(auth)/sign-up/` | git mv |
| `src/app/account/forgot-password/` → `src/app/account/(auth)/forgot-password/` | git mv |
| `src/app/account/reset-password/` → `src/app/account/(auth)/reset-password/` | git mv |
| `src/app/account/page.tsx` → `src/app/account/(authed)/page.tsx` | git mv |
| `src/app/account/settings/` → `src/app/account/(authed)/settings/` | git mv |
| `src/app/account/products/` → `src/app/account/(authed)/products/` | git mv |
| `src/app/account/logout-button.tsx` | unchanged (used by `(authed)/layout.tsx` and existing pages) |
| 18 × `public/**/*.html` | nav swap + script swap (Node helper, same approach as v3) |

---

## Risks & open questions

1. **Auth pages already render their own `<style>` blocks** with `auth-card` rules. The new `(auth)/layout.tsx` shouldn't duplicate them. Plan: layout provides ONLY a wrapper (centered flex, top logo) + global page-level positioning. Each auth page keeps its own form CSS.

2. **The existing `.acct-nav` / `.acct-main` / `.acct-footer` styles in `account/layout.tsx`** — do any of the auth/portal pages reference those class names directly? Quick grep needed in plan to confirm.

3. **`/account/products/[slug]` has its own header** with a "Back to your account" link and product-page eyebrow. The new portal shell's central nav (Dashboard / Settings) will sit ABOVE that header — fine, just stacked. No collision with existing classes.

4. **Active-state styling** for Dashboard/Settings nav links in portal shell: brief says "active-state styling on whichever matches the current path". Layouts run on the server in Next 15 App Router; we have access to `usePathname` only in client components. Plan: make the portal layout's nav a small client component (`<PortalNav />`) that uses `usePathname` for active state. The rest of the layout stays server-rendered.

5. **`/account/settings/forms.tsx` is already a client component** — fine as-is.

6. **`logout-button.tsx`** is used by `account/page.tsx` and `account/settings/page.tsx` directly today. Plan: it'll be used by the new `(authed)/layout.tsx`'s portal shell instead — so the per-page LogoutButton uses become redundant. Remove them from the moved page.tsx and settings/page.tsx (they were inside per-page headers); the layout's right-side LogoutButton replaces them.

7. **`/account/products/[slug]` has its own `LogoutButton` import/render** in the page. Same: the layout-level button covers it. Remove from the product page header.

8. **Product page back link** ("← Back to your account") — keep it; it's content, not chrome. The layout nav has logo→/, plus Dashboard/Settings center, plus Sign Out right. Page-level back link is independent.

9. **CSS variable inheritance** — verify `globals.css` defines the `--bg-base` `--accent` `--border` etc. used by both layouts. If layouts depend on those, they must already be loaded by `src/app/layout.tsx` (root layout). Plan: confirm by reading root layout in execute step.

10. **Mobile nav toggling** in marketing pages is handled by an existing JS block in each HTML file (mobileToggle button, mobileNav `.open` class). The new auth-state script runs alongside; no interaction.

11. **Deviation in toolkit.html** — its mobile-nav uses `class="mobile-nav-link"` on each `<a>`. The Sign In replacement must preserve that class. Same as v3's handling.

12. **Deviation in maintenance.html** — its desktop AND mobile Products link points to `/maintenance` not `/products`. The auth-link insertion needs to come AFTER whichever Products line exists. The Phase B v3 helper already handled this via regex alternation `(products|maintenance)`. We reuse the same regex.

13. **Empty CSS hook**: we add `.nav-auth-link` class to the desktop link, but the brief says match existing styling exactly — so no new CSS is added per-file. The class is purely a future hook. If we'd rather not add a no-op class, we can drop it. **Plan defaults to including it** because the brief explicitly named it (#3 "CSS for the new nav-auth-link class"); the class is added with zero new rules.

---

## What ships unchanged (per hard rules)

- `src/lib/webhook/process-checkout.ts` — webhook untouched.
- `src/app/api/stripe-webhook/route.ts` — untouched.
- `emails/*.html` — untouched.
- `scripts/smoke-test-webhook.ts` — untouched.
- `customers` schema — no migrations.
- `/account/*` URLs — only layout inheritance changes; routes resolve to the same paths.
- Marketing nav typography — `.nav-link` class reused, no new font/size/color.
