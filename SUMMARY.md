# 910 Academy — Deploy Summary

## Deploy URLs
- **Production**: https://910-academy-deploy.vercel.app (alias)
- **Immutable**: https://910-academy-deploy-a0tkehi4o-slodhy1-4543s-projects.vercel.app
- **Inspector**: https://vercel.com/slodhy1-4543s-projects/910-academy-deploy/FsN1QbDuwqCKumKAhTw3ExJ7LnSM
- **GitHub**: https://github.com/slodhy1/910-academy-website

> Note: GitHub user requested was `slodhy/910-academy-website`, but the authenticated `gh` account is `slodhy1`. Repo was created under `slodhy1` instead.

## ⚠️ Deployment Protection is ON
Both URLs currently return `401/404` because the Vercel team `slodhy1-4543s-projects` has **Deployment Protection** enabled by default. To make the site publicly accessible:

1. Go to https://vercel.com/slodhy1-4543s-projects/910-academy-deploy/settings/deployment-protection
2. Set **Vercel Authentication** → **Disabled** (or add an allowlist)
3. Save — URL becomes public immediately, no redeploy needed.

## Pages deployed
| Route | File | In nav? |
|---|---|---|
| `/` | `index.html` | — |
| `/skool` | `skool.html` | ✅ |
| `/affiliate-links` | `affiliate-links.html` | ✅ (Gear / Plugins / Software → `#gear`, `#plugins`, `#software`) |
| `/products` | `products.html` | ❌ direct URL only |
| `/toolkit` | `toolkit.html` | ❌ direct URL only |

`cleanUrls: true` is set in `vercel.json`, so `.html` extensions are stripped.

## What was done
1. ✅ Created `/Users/slodhy/dev/910-academy-deploy/` — originals in `/Users/slodhy/dev/910-Academy-Website/` untouched.
2. ✅ Downloaded **16 assets** from `910academy.com/wp-content/uploads/` → `/public/` (hero, origin, coaching, logo, event placeholder, 11 product/affiliate images).
3. ✅ Bulk rewrote all hot-linked WP URLs → local `/…` paths in all 5 HTML files. Verified zero remaining references.
4. ✅ Normalized nav across all pages:
   - Gear → `/affiliate-links#gear`
   - Plugins → `/affiliate-links#plugins`
   - Software → `/affiliate-links#software`
   - Skool → `/skool`
   - CTA → `https://www.skool.com/910-academy/about`
   - Anchor IDs `#gear` / `#plugins` / `#software` already exist in `affiliate-links.html` — no changes needed.
5. ✅ Replaced Calendly placeholder with `https://calendly.com/910academy/booking` in `index.html` and `skool.html`.
6. ✅ Rewired email form (`#email`) to POST to a Google Apps Script web app via FormData. Success message shows after submit. **Requires** updating `APPS_SCRIPT_URL` in `index.html` line ~1610 with the real URL after deploying `apps-script.gs`.
7. ✅ Added `TODO` comment above the event carousel in `index.html` flagging the 6 duplicate placeholder images.
8. ✅ Injected meta tags (favicon, OG, Twitter card) into `<head>` of all 5 pages.
9. ✅ Created `og-image.jpg` (copy of hero-bg.jpg — see TODO).
10. ✅ Wrote `vercel.json` with `cleanUrls`, immutable asset cache headers, no-cache HTML headers.
11. ✅ Wrote `apps-script.gs` with setup instructions + `doPost`/`doGet` handlers.
12. ✅ `git init` → initial commit → `gh repo create` → push to `slodhy1/910-academy-website`.
13. ✅ `vercel --prod --yes --scope slodhy1-4543s-projects` → deployed successfully.

## Next steps (action required)
1. **Disable Vercel Deployment Protection** (see above) — the site is 404/401 until you do this.
2. Deploy the Apps Script (`apps-script.gs`) following its header comment, paste the web app URL into `index.html` where it says `APPS_SCRIPT_URL = 'https://script.google.com/macros/s/REPLACE_ME/exec'`, commit, redeploy.
3. Replace the 6 duplicate event carousel images (search for `TODO` in `index.html`).
4. Replace `/public/og-image.jpg` with a proper 1200×630 social card.
5. Confirm `https://calendly.com/910academy/booking` is the real booking URL.

## Issues / notes
- **GitHub org mismatch**: repo is at `slodhy1/910-academy-website`, not `slodhy/…`. Rename the user account or transfer the repo if `slodhy` is preferred.
- **Deployment Protection** blocks the public URL until disabled in project settings. This is a team-level default, not something I can fix from the CLI without the right token scope.
- Image optimization (AVIF/WebP conversion, explicit width/height attributes, `loading="lazy"`) was NOT done — plan.md step 2 was deferred to keep this deploy focused. Hero is 927 KB, coaching 581 KB, origin 280 KB. Recommend `sharp` pass before promoting to the real domain.
- `products.html`, `skool.html`, `affiliate-links.html`, `toolkit.html` were not individually audited beyond nav/asset rewrites. Their internal layouts may have their own issues (unverified).
- Email form uses `fetch(..., { mode: 'no-cors' })` so we never read the Apps Script response — on network failure the user still sees a success message. Acceptable for a newsletter capture, not for anything critical.
- No favicon.ico was created; favicon uses `/logo-white.svg`. Modern browsers handle this, IE does not.
