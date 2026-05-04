# Project Workflow

## How Claude Code operates in this repo

Reference doc. When invoked in this repo, Claude Code follows this workflow unless explicitly instructed otherwise.

## 1. Boris workflow (mandatory for non-trivial work)

For anything beyond a single-file edit:

1. **research.md** — Claude reads relevant existing code, surfaces what's there, identifies edge cases, lists assumptions
2. **plan.md** — Claude proposes the change in terms of files to create/edit, with specific selectors/identifiers, not generic descriptions
3. **Wait for approval** — Shayan reviews plan.md and explicitly says "go" or sends edits
4. **Execute** — Claude implements exactly what was approved, no scope expansion
5. **Verify** — local checks (`grep`, `curl` on already-deployed URL, file size sanity)
6. **Commit + deploy** — only after verification

For trivial edits (typo fix, single-value change), skip 1–2 and proceed straight to execute.

Single-file CSS tweak ≠ Boris. Multi-file refactor or new feature = Boris.

## 2. File structure conventions (this repo)

Hybrid Next.js + static HTML. Static product/landing pages live in `/public/`; auth-gated routes live under `/src/app/account/`.

- `/public/index.html` + `/public/<page>.html` — top-level static pages (`about.html`, `gear.html`, `toolkit.html`, `waitlist.html`, `book.html`, `coaching.html`, `affiliate-guidelines.html`, `maintenance.html`, `products.html`, `products-archive.html`)
- `/public/products/<slug>.html` — individual sales pages (one per active product)
- `/public/_drafts/<slug>.html` — gated content not yet exposed publicly (e.g. `four-horsemen-workshop.html`)
- `/public/og-images/<slug>.jpg + .webp + .png` — product thumbnails / OG previews. Bump `?v=N` on references when overwriting (immutable cache header)
- `/public/images/retailers/` — affiliate logos (`amazon.svg`, `bh.png`)
- `/src/app/account/` — Next.js auth pages (login, forgot-password, reset-password, dashboard)
- `/src/app/account/products/[slug]/page.tsx` — gated product viewer (server-side ownership check)
- `/src/app/api/checkout/route.ts` + `/src/app/api/stripe-webhook/route.ts` — Stripe endpoints
- `/src/lib/supabase/server.ts` — server-side client (cookies via `@supabase/ssr`)
- `/src/lib/supabase/client.ts` — browser client
- `/src/lib/supabase/admin.ts` — service-role client (bypasses RLS, server-only)
- `/src/lib/supabase/storage.ts` — signed URL helpers for `product-resources` bucket
- `/src/components/account/` — gated viewer components (`VideoViewer`, `MultiVideoViewer`, `PdfViewer`, `ResourcesPanel`, `AboutDisclosure`)
- `/middleware.ts` — Supabase auth middleware (redirects unauthed `/account/*` to login)
- `/supabase/migrations/000N_description.sql` — applied via `supabase db push`
- `/supabase/seed_phase*.sql` — idempotent inserts via `on conflict (slug) do update`. Phase-based file naming
- `/scripts/` — helper bash scripts:
  - `check-gated-pages.sh` — runs in `prebuild`; fails if any gated draft accidentally lands in `public/products/`
  - `fetch-vimeo-thumb.sh VIDEO_ID OUTPUT_FILENAME [HASH]` — pulls Vimeo OG thumbnail, crops to 1200×630
  - `audit-vimeo-ids.sh` — validates every product Vimeo ID against actual video metadata

## 3. Commands, in order

### Local development
- `npm run dev` — local Next.js dev server, reads `.env.local`. Static HTML in `/public/` is served as-is at the rewritten paths defined in `next.config.ts`
- `supabase start` — local Supabase (only if working on schema)

### Before any commit
- `npm run build` — catches type errors, runs the prebuild hook
- The `prebuild` hook (`bash scripts/check-gated-pages.sh`) refuses to build if any file in the `GATED_PAGES` array exists in `public/products/`

### Database changes
1. Add migration in `supabase/migrations/000N_description.sql`
2. `supabase db push --linked` — applies to remote, prompts for DB password
3. Verify via `supabase db query --linked "<sql>"` or the Supabase SQL editor before proceeding
4. Update relevant `seed_phase*.sql` if columns changed; run via `supabase db query --linked --file supabase/seed_phaseX.sql`

### Image assets
- Compress before commit. ImageMagick:
  ```
  magick input.png -quality 85 output.webp
  magick input.png -quality 82 output.jpg
  magick input.png -trim +repage output.png   # strip transparent padding when needed
  ```
- Add cache-bust query (`?v=N`) on `<img src>` references when overwriting an existing path. The `vercel.json` headers rule applies `Cache-Control: public, max-age=31536000, immutable` to all `(jpg|jpeg|png|webp|avif|svg|ico|woff2)` paths

### Commit + deploy
- `git add <specific files>` — NEVER `git add .`
- `git commit -m "<message>"` (see §4)
- `git push origin main`
- `vercel --prod --yes` (or `--force` if cache might be stale)

### When deploy seems wrong
- Compare local file content vs deployed via `curl + grep` first (confirm parity)
- If they differ: `vercel --prod --yes --force`
- If they match but the page is visually broken: open DevTools, inspect computed styles. Use `python3 -c "import html5lib; ..."` to inspect parsed DOM if HTML structure is suspect

## 4. Commit message convention

Pulled from this repo's recent log:

- Optional scope prefix with colon, then sentence-case description
- Lowercase first word OR sentence-case noun (both seen)
- No trailing period
- Imperative or descriptive — both used
- Aim for under 72 chars on the subject line

Examples (verbatim):
- `Homepage fallback: redirect ?code=... query to /account/reset-password`
- `Products: convert horizontal slider rails to 4-across grid layout`
- `Gear: reduce Amazon logo size to match B&H visual weight`
- `Phase 4: Public products listing + Four Horsemen Coming Soon`
- `Fix product hero thumbnails: un-nest anchors + cache-bust query`

Co-author trailer when committing as Claude:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## 5. Verification before declaring done

After every deploy, run these in order. If any fail, do NOT report success:

- `curl -I https://www.910academy.com/<path>` → expect `200`
- `curl -s https://www.910academy.com/<path> | grep -c "<expected substring>"` → expect specific count
- For asset paths: `curl -sI https://www.910academy.com/<asset>` → check `content-type` and `content-length`
- For gated pages: `curl -s -o /dev/null -w '%{http_code} → %{redirect_url}\n' https://www.910academy.com/<path>` → expect 307 → `/account/login` when unauth
- Open in incognito (avoids browser cache, especially relevant given `immutable` headers on assets)
- For visual changes: send back screenshot or ask Shayan to confirm; do not rely on Claude's own visual judgment

NEVER say "deploy successful" without these checks. NEVER say "should be working" — verify or surface uncertainty.

## 6. When to stop and ask

Stop and surface to Shayan instead of guessing when:

- A fix has been attempted twice and didn't work — don't try a third unprompted
- A file path is ambiguous (multiple matches for a fuzzy name)
- Required input is missing (Stripe URL, an asset Shayan must upload, a B&H URL)
- A change would touch files outside the explicit scope of the request
- An action is irreversible (deleting files, dropping DB tables, force-pushing, sending emails, posting to Slack)

Ask before doing. Don't apologize after.

## 7. Anti-patterns (don't do these)

Hard-won lessons from this project:

- **`git add .`** — explicitly list files. Avoids committing `.env.local`, `.DS_Store`, intermediate generated files
- **Nested `<a>` inside `<a>`** — HTML5 parser ejects content from the outer anchor, breaking layouts. Encountered on every `.thumb-card` page; resolved by switching outer wrapper to `<div>`
- **`scroll-padding-inline` for first-card centering** — at `scrollLeft: 0` the first card is constrained by its leading padding; can't go negative. Use JS `scrollLeft` assignment instead
- **`<picture>` wrapper when `<img>` works** — extra structure for marginal WebP wins; visual bugs hide in the wrapper interaction with parent CSS. Use plain `<img src="...jpg">` unless there's a clear payoff
- **Trusting local content == deployed content** — Vercel caches deploys. Always `curl` the live URL to confirm before claiming a fix landed
- **`vercel --prod` without `--yes`** — interactive confirmation prompt blocks automation
- **Long inline code in chat** — write to file. Inline code over ~10 lines becomes hard to follow
- **Importing JSON workflows for n8n** — use the MCP API to create them programmatically
- **Claiming a fix worked without browser verification** — visual bugs hide in cache layers and CSS cascades
- **Skipping the prebuild hook** — never run `next build` directly; always `npm run build` so `check-gated-pages.sh` fires
- **Force-pushing to main** — banned. Use `git revert` instead

## 8. Recovery from a broken deploy

If production is broken:

1. `git log --oneline -10` — find the last known-good commit
2. `git revert <bad commit hash>` — generates a new revert commit (no force-push)
3. `git push origin main`
4. `vercel --prod --yes --force`
5. Verify via `curl` + incognito browser load
6. THEN diagnose the original issue offline before attempting a re-fix

Never force-push to `main`. Never delete commits to "clean up history" — `git reflog` is the safety net but reverts are auditable.

## 9. Environment variables

This repo's required env vars (all set in Vercel Production scope):

**Public (NEXT_PUBLIC_*)** — safe to ship to client:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — e.g. `https://www.910academy.com` (no trailing slash). Used by `forgot-password` for `redirectTo`

**Private (server-only)** — never log, never echo:
- `SUPABASE_SERVICE_ROLE_KEY` — used by `admin.ts`; bypasses RLS
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Manage via:
- `vercel env ls` — list (values shown as `Encrypted`)
- `vercel env add VAR_NAME production` — add (interactive; pipe via `printf "%s" "$value" | vercel env add NAME production` for non-interactive)
- After adding/changing: `vercel --prod --yes` to redeploy with new vars active
- Local mirror in `.env.local` (gitignored)

## 10. The CLAUDE.md / primer.md pattern

If `CLAUDE.md` or `primer.md` exists at repo root, it provides project-specific context (client name, brand voice, decision-making rules, escalation criteria) that overrides generic defaults.

When starting work in a new repo: write `CLAUDE.md` FIRST, before anything else. It's the brain.

This repo currently has neither — `WORKFLOW.md` is the conventions doc and stands alone until a `CLAUDE.md` is added.
