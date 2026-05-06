# Phase B v4 plan — split account layout into (auth) + (authed) + marketing nav refactor

Diff-level precision. No file outside this list will be touched.

---

## Schema migration: NONE.
## Webhook / email / smoke test: untouched.

---

## Change 1 — Route group reshuffle

### `git mv` operations

```bash
mkdir -p src/app/account/'(auth)'
mkdir -p src/app/account/'(authed)'

git mv src/app/account/login            src/app/account/'(auth)'/login
git mv src/app/account/sign-up          src/app/account/'(auth)'/sign-up
git mv src/app/account/forgot-password  src/app/account/'(auth)'/forgot-password
git mv src/app/account/reset-password   src/app/account/'(auth)'/reset-password

git mv src/app/account/page.tsx         src/app/account/'(authed)'/page.tsx
git mv src/app/account/settings         src/app/account/'(authed)'/settings
git mv src/app/account/products         src/app/account/'(authed)'/products

git rm src/app/account/layout.tsx
```

`logout-button.tsx` does NOT move — it stays at `src/app/account/logout-button.tsx`. Both new layouts and the moved authed pages import it via relative paths that resolve correctly under route groups.

### Import path adjustments

Route groups DO add a real folder layer in the filesystem; URL routing skips them, file resolution does not. The pages that imported `../logout-button` previously were one level deep (e.g. `account/page.tsx` → `./logout-button`). After moving into `(authed)/`, the relative path becomes `../logout-button`.

| File | Old import | New import |
|---|---|---|
| `(authed)/page.tsx` (was `account/page.tsx`) | `import { LogoutButton } from "./logout-button"` | `import { LogoutButton } from "../logout-button"` |
| `(authed)/settings/page.tsx` (was `account/settings/page.tsx`) | `import { LogoutButton } from "../logout-button"` | `import { LogoutButton } from "../../logout-button"` |
| `(authed)/products/[slug]/page.tsx` (was `account/products/[slug]/page.tsx`) | `import { LogoutButton } from "../../logout-button"` | `import { LogoutButton } from "../../../logout-button"` |

**Per spec change #5**, the layout's right-side renders the LogoutButton — so the per-page LogoutButton becomes redundant. Plan: **remove** the per-page LogoutButton from these three pages along with the surrounding header `<div>` that wraps it (since the header layout becomes simpler). The pages keep their own page headings (e.g. `dash-heading`, `settings-heading`, `viewer-title`) as content. The shell logo + center nav + LogoutButton lives only in `(authed)/layout.tsx`.

After the LogoutButton imports are removed from the three pages, those imports go away. Net: `logout-button.tsx` is imported only by `(authed)/layout.tsx`.

---

## Change 2 — `src/app/account/(auth)/layout.tsx` (new)

Minimal centered chrome. No nav. Just the brand logo at top and a "← Back to home" link below.

```tsx
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="auth-shell">
        <Link href="/" className="auth-logo" aria-label="910 Academy home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.svg" alt="910 Academy" width={36} height={36} />
        </Link>
        <main className="auth-shell-main">{children}</main>
        <Link href="/" className="auth-shell-back">
          ← Back to home
        </Link>
      </div>
      <style>{`
        .auth-shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 64px 24px 48px;
          gap: 32px;
        }
        .auth-logo { display: inline-block; opacity: 0.95; transition: opacity 0.2s; }
        .auth-logo:hover { opacity: 1; }
        .auth-logo img { height: 36px; width: auto; display: block; }
        .auth-shell-main {
          width: 100%;
          max-width: 480px;
          display: flex;
          justify-content: center;
        }
        .auth-shell-back {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--fg-muted);
          transition: color 0.2s;
        }
        .auth-shell-back:hover { color: var(--accent); }
        @media (max-width: 600px) {
          .auth-shell { padding: 48px 16px 32px; gap: 28px; }
        }
      `}</style>
    </>
  );
}
```

The auth pages each have their own `<div class="auth-card">` form chrome inside their own `<style>` block — the layout doesn't duplicate or override those.

---

## Change 3 — `src/app/account/(authed)/layout.tsx` (new)

Portal shell: logo left, Dashboard + Settings center (active-state from `usePathname`), Sign Out right. Persistent across all `(authed)` routes.

Two files: a server-rendered layout shell + a client `<PortalNav />` for active-state. Or simpler — make the entire layout client. The brief favors keeping layouts server-rendered when possible. We'll make a small client island for the nav links and keep the rest server.

### `src/app/account/(authed)/layout.tsx`

```tsx
import Link from "next/link";
import { LogoutButton } from "../logout-button";
import { PortalNav } from "./portal-nav";

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="portal-nav">
        <div className="portal-nav-inner">
          <Link href="/" className="portal-nav-logo" aria-label="910 Academy home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.svg" alt="910 Academy" width={36} height={36} />
          </Link>
          <PortalNav />
          <div className="portal-nav-right">
            <LogoutButton />
          </div>
        </div>
      </nav>
      <main className="portal-main">{children}</main>
      <footer className="portal-footer">
        <p className="portal-footer-copy">&copy; 2026 910 Academy. All rights reserved.</p>
      </footer>
      <style>{`
        .portal-nav { position: fixed; top: 0; left: 0; width: 100%; z-index: 1000; padding: 18px 0; background: rgba(0,0,0,0.55); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); border-bottom: 1px solid var(--border); }
        .portal-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .portal-nav-logo img { height: 36px; width: auto; opacity: 0.95; transition: opacity 0.2s; }
        .portal-nav-logo:hover img { opacity: 1; }
        .portal-nav-right { display: flex; align-items: center; }
        .portal-main { padding: 120px 24px 80px; max-width: 1100px; margin: 0 auto; min-height: calc(100vh - 200px); }
        .portal-footer { border-top: 1px solid var(--border); padding: 56px 40px; text-align: center; }
        .portal-footer-copy { font-size: 12px; color: var(--fg-ghost); letter-spacing: 0.04em; }
        @media (max-width: 768px) {
          .portal-nav-inner { padding: 0 16px; gap: 12px; }
          .portal-main { padding: 100px 20px 64px; }
          .portal-footer { padding: 40px 24px; }
        }
      `}</style>
    </>
  );
}
```

### `src/app/account/(authed)/portal-nav.tsx` (new client component)

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/account", label: "Dashboard" },
  { href: "/account/settings", label: "Settings" },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <div className="portal-nav-links">
      {ITEMS.map((item) => {
        const isActive =
          item.href === "/account"
            ? pathname === "/account"
            : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`portal-nav-link${isActive ? " portal-nav-link-active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
      <style>{`
        .portal-nav-links { display: flex; align-items: center; gap: 28px; }
        .portal-nav-link { font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); transition: color 0.2s; position: relative; padding: 4px 0; }
        .portal-nav-link:hover { color: var(--fg); }
        .portal-nav-link-active { color: var(--fg); }
        .portal-nav-link-active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 1px; background: var(--accent); }
        @media (max-width: 600px) {
          .portal-nav-links { gap: 18px; }
          .portal-nav-link { font-size: 12px; letter-spacing: 0.1em; }
        }
      `}</style>
    </div>
  );
}
```

Active rule: `/account` matches exactly; `/account/settings` matches with `startsWith`. `/account/products/[slug]` doesn't match either nav link, so neither shows active — correct (users on a product viewer see no portal-link highlighted).

---

## Change 4 — Edits to moved authed pages

### `(authed)/page.tsx` (was `account/page.tsx`)

**Imports**:

```diff
-import { LogoutButton } from "./logout-button";
+import { LogoutButton } from "../logout-button";
```

Actually: per the layout-renders-LogoutButton plan, **remove the import entirely** since the page no longer renders LogoutButton. Same for the JSX usage:

```diff
       <header className="dash-header">
         <div>
           <p className="dash-eyebrow">YOUR ACCOUNT</p>
           <h1 className="dash-heading">Welcome back, {greetingName}.</h1>
         </div>
-        <LogoutButton />
       </header>
```

The `dash-header` flex-row with two children becomes a single child. CSS keeps `flex-wrap: wrap` so it still renders fine; no CSS edit needed.

### `(authed)/settings/page.tsx` (was `account/settings/page.tsx`)

```diff
-import { LogoutButton } from "../logout-button";
+import { LogoutButton } from "../../logout-button";
```

Actually remove entirely:

```diff
-import { LogoutButton } from "../logout-button";
   ...
       <header className="settings-head">
         <div>
           <Link href="/account" className="settings-back">← Back to your account</Link>
           ...
         </div>
-        <LogoutButton />
       </header>
```

### `(authed)/products/[slug]/page.tsx` (was `account/products/[slug]/page.tsx`)

```diff
-import { LogoutButton } from "../../logout-button";
   ...
       <header className="viewer-head">
         <div className="viewer-head-left">
           ...
         </div>
-        <LogoutButton />
       </header>
```

---

## Change 5 — Marketing nav refactor in 18 HTML files

Done via a one-off Node helper (same approach as v3). Per file, three operations:

### Operation A — desktop nav-links

Replace the v3 Account link with the new Sign In auth slot, and add `data-join-cta` to the Join CTA.

```diff
       <a href="/products" class="nav-link">Products</a>
-      <a href="/account" class="nav-link" data-account-link>Account</a>
-      <a href="https://www.skool.com/910-academy/about" target="_blank" ... class="nav-cta">Join 910 Academy</a>
+      <a href="/account/login" class="nav-link nav-auth-link" data-auth-link data-state="logged-out">Sign In</a>
+      <a href="https://www.skool.com/910-academy/about" target="_blank" ... class="nav-cta" data-join-cta>Join 910 Academy</a>
```

(Some files use `target="_blank" rel="noopener noreferrer"`, others `target="_blank"` only. The replace preserves the existing form.)

For `maintenance.html`: Products line is `/maintenance`. Replace pattern handles both via regex.

### Operation B — mobile nav

```diff
   <a href="/products">Products</a>
-  <a href="/account" data-account-link>Account</a>
-  <a href="https://www.skool.com/910-academy/about" target="_blank" ... style="color:var(--accent);">Join 910 Academy</a>
+  <a href="/account/login" data-auth-link data-state="logged-out">Sign In</a>
+  <a href="https://www.skool.com/910-academy/about" target="_blank" ... style="color:var(--accent);" data-join-cta>Join 910 Academy</a>
```

For `toolkit.html`: mobile uses `class="mobile-nav-link"`. The replacement adds the same class and the new attributes.

### Operation C — script swap

The v3 script (single-purpose) is replaced with the dual-purpose script:

```diff
 <script>
 (function(){
   try {
     var hasSession = document.cookie.indexOf("sb-qkmkxthpeapuecobahhx-auth-token") !== -1;
-    if (!hasSession) {
-      var els = document.querySelectorAll("[data-account-link]");
-      els.forEach(function(el){ el.setAttribute("href", "/account/login"); });
+    var authLinks = document.querySelectorAll("[data-auth-link]");
+    if (hasSession) {
+      authLinks.forEach(function(el){
+        el.setAttribute("href", "/account");
+        el.setAttribute("data-state", "logged-in");
+        el.textContent = "My Account";
+      });
+      var joinCtas = document.querySelectorAll("[data-join-cta]");
+      joinCtas.forEach(function(el){ el.style.display = "none"; });
     }
   } catch (e) { /* no-op */ }
 })();
 </script>
```

### Helper script outline

```js
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [ /* same 18 paths as v3 */ ];
const NEW_SCRIPT = `<script>\n(function(){\n  try {\n    var hasSession = document.cookie.indexOf("sb-qkmkxthpeapuecobahhx-auth-token") !== -1;\n    var authLinks = document.querySelectorAll("[data-auth-link]");\n    if (hasSession) {\n      authLinks.forEach(function(el){\n        el.setAttribute("href", "/account");\n        el.setAttribute("data-state", "logged-in");\n        el.textContent = "My Account";\n      });\n      var joinCtas = document.querySelectorAll("[data-join-cta]");\n      joinCtas.forEach(function(el){ el.style.display = "none"; });\n    }\n  } catch (e) { /* no-op */ }\n})();\n</script>\n`;

for (const f of FILES) {
  let src = readFileSync(f, "utf-8");

  // 1. Desktop: replace v3 Account link with Sign In auth slot
  src = src.replace(
    /<a href="\/account" class="nav-link" data-account-link>Account<\/a>\n/,
    `<a href="/account/login" class="nav-link nav-auth-link" data-auth-link data-state="logged-out">Sign In</a>\n`
  );

  // 2. Mobile: replace v3 Account link with Sign In auth slot (preserve mobile-nav-link class if present)
  src = src.replace(
    /(  )<a href="\/account"( class="mobile-nav-link")? data-account-link>Account<\/a>\n/,
    (m, indent, cls) =>
      `${indent}<a href="/account/login"${cls ?? ""} data-auth-link data-state="logged-out">Sign In</a>\n`
  );

  // 3. Add data-join-cta to desktop Join CTA (idempotent — only if not already present)
  src = src.replace(
    /<a (href="https:\/\/www\.skool\.com\/910-academy\/about"[^>]*class="nav-cta")(?![^>]*data-join-cta)>/,
    `<a $1 data-join-cta>`
  );

  // 4. Add data-join-cta to mobile Join CTA
  src = src.replace(
    /<a (href="https:\/\/www\.skool\.com\/910-academy\/about"[^>]*style="color:var\(--accent\);")(?![^>]*data-join-cta)>/,
    `<a $1 data-join-cta>`
  );

  // 5. Replace the v3 script with v4 script
  src = src.replace(
    /<script>\n\(function\(\)\{\n  try \{\n    var hasSession = document\.cookie\.indexOf\("sb-qkmkxthpeapuecobahhx-auth-token"\) !== -1;\n    if \(!hasSession\) \{\n      var els = document\.querySelectorAll\("\[data-account-link\]"\);\n      els\.forEach\(function\(el\)\{ el\.setAttribute\("href", "\/account\/login"\); \}\);\n    \}\n  \} catch \(e\) \{ \/\* no-op \*\/ \}\n\}\)\(\);\n<\/script>\n/,
    NEW_SCRIPT
  );

  writeFileSync(f, src);
}
```

The regex for step 5 escapes carefully — using a multi-line `RegExp` literal with the exact string content of the v3 script. Verified by grep that all 18 files have the exact same block.

---

## Change 6 — CSS for `nav-auth-link`

Per research: no per-file CSS additions required. The class is added as a no-op hook (matches the brief's "match existing nav-link styling exactly" — and the existing class is `nav-link`, which is already applied alongside).

If the brief intended a literal new CSS rule in each file, the rule would be:

```css
.nav-auth-link { /* same as .nav-link — handled by composition */ }
```

Plan **does not** add this empty rule across 18 files. The class hook exists; future styling can target `.nav-auth-link` if needed without re-editing each file (the variable could be set per-state in JS too via `data-state="logged-in"`).

---

## Change 7 — Optional sanity: confirm root `globals.css`

Plan checks before relying on global vars:

```bash
grep -E "^:root|--bg-base|--accent|--border" src/app/globals.css | head
```

If vars are present (expected from inheritance), no change needed. If not, plan reads `src/app/layout.tsx` to confirm where they're defined. Likely OK — Phase B v2/v3 already use these vars on `auth-card`, `dash-grid`, `settings-section`, etc.

---

## Order of operations in execute step

1. `git mv` the auth pages into `(auth)/`.
2. `git mv` the authed pages into `(authed)/`.
3. `git rm` the old `src/app/account/layout.tsx`.
4. Create `src/app/account/(auth)/layout.tsx`.
5. Create `src/app/account/(authed)/layout.tsx`.
6. Create `src/app/account/(authed)/portal-nav.tsx`.
7. Edit `(authed)/page.tsx` — drop LogoutButton import + JSX.
8. Edit `(authed)/settings/page.tsx` — drop LogoutButton import + JSX.
9. Edit `(authed)/products/[slug]/page.tsx` — drop LogoutButton import + JSX.
10. Run Node helper to patch 18 marketing HTML files.
11. `npm run build` — must pass clean.
12. STOP for "deploy".

---

## Files explicitly NOT touched

- `src/lib/webhook/process-checkout.ts` — webhook untouched.
- `src/app/api/stripe-webhook/route.ts` — untouched.
- `emails/*.html` — untouched.
- `scripts/smoke-test-webhook.ts` — untouched.
- `middleware.ts` — Phase B v3 self-healing already correct; route groups don't change matchers.
- `src/app/account/logout-button.tsx` — untouched.
- `src/app/account/(auth)/login/page.tsx` and the other 3 auth pages — moved verbatim, internal contents unchanged.
- `src/app/account/(auth)/sign-up/actions.ts` — moved verbatim.
- `src/app/account/(authed)/products/[slug]/not-found.tsx` — moved verbatim.
- `src/app/account/(authed)/settings/forms.tsx` — moved verbatim.
- All Supabase migrations — schema unchanged.

---

## Risks / soft warnings

1. **Route group `()` folder names need shell-quoting in `git mv`**. Plan uses single quotes: `git mv src/app/account/login src/app/account/'(auth)'/login`. Verified safe under zsh + bash.

2. **Next 15 metadata file resolution under route groups**. App router's `not-found.tsx`, `loading.tsx`, etc. are co-located. We're moving `products/[slug]/not-found.tsx` along with `page.tsx`. Verified Next.js handles this correctly.

3. **No-op `nav-auth-link` class**. Per research — class is added without new CSS rules. If you want a visual variant later, target `.nav-auth-link[data-state="logged-in"]` etc.

4. **The portal nav's `usePathname`** runs client-side. The layout itself stays a server component; only the small `<PortalNav />` island is client. This avoids forcing the entire layout to client-render and keeps fast initial paint.

5. **`document.cookie.indexOf(...)` is substring match** — a malicious cookie name like `xx-sb-qkmkxthpeapuecobahhx-auth-token` would falsely satisfy. Real Supabase auth cookies are first-party HTTP-cookie-set by the SSR client; the browser doesn't accept arbitrary similar-named cookies from arbitrary origins. Acceptable risk for a soft UI signal (clicking the link still hits the middleware which authoritatively redirects). Same approach as v3.

6. **Hidden Join CTA when logged-in** uses `el.style.display = "none"` — wins over CSS rules (inline style highest specificity short of `!important`). Verified safe across all 18 files.

7. **Mobile-nav layout** with the new "Sign In" item: `gap: 36px` between items in `.mobile-nav` flex column already accommodates an extra row. No CSS change needed.

8. **Delete old layout sequence**: `git rm src/app/account/layout.tsx` is idempotent; if the file was already moved/renamed earlier, the rm errors. Plan rms only after the page moves are complete.

---

## Stop point

Execute does NOT begin until user replies "go".
