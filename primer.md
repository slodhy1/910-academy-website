# Agent on Camera (AOC) waitlist — build primer

Email-only waitlist for the **Agent on Camera** launch (doors open **July 1, 2026, 8:00 PM ET** = `2026-07-02T00:00:00Z`). Page → `/api/aoc/waitlist` → Supabase (durable) + Kit (best-effort) → `/aoc/thanks`.

## What was built

**Architecture decision:** 910academy.com's public site is **static HTML in `/public`** (the React/shadcn components are portal-only — `/account`, `/admin`). To look native, `/aoc` was built as a static HTML page on the canonical token system (modeled on `public/waitlist.html`), not as a shadcn App Router page. The only Next.js piece is the API route. See `research-aoc.md` for the full rationale.

- **`/aoc`** — hero with "AGENT ON CAMERA" text lockup, left-weighted headline "THE GAME IS ABOUT TO CHANGE", bottom-right subhead "It will be worth the wait", a centered glass form card (First name + Email + a single accent CTA — the only eye-magnet), the modules tease line, and a timezone-correct countdown that swaps to a "Doors are open" state on expiry. Captures UTM params, POSTs to the API, redirects to `/aoc/thanks`.
- **`/aoc/thanks`** — "You're on the list." confirmation with the spec copy + a swappable Claudio video slot (`#aocVideoSlot`).
- **API + data layer** — zod-validated route, email upsert into Supabase (durable record), best-effort Kit subscriber + waitlist-tag sync that never fails the user.

## Files added / changed

| File | What |
|---|---|
| `supabase/migrations/0010_aoc_waitlist.sql` | `public.aoc_waitlist` table (RLS on, no policies = service-role only) |
| `scripts/apply-aoc-waitlist-migration.mjs` | Applies the migration via `pg` + `SUPABASE_DB_URL` (already run) |
| `src/app/api/aoc/waitlist/route.ts` | `POST /api/aoc/waitlist` — zod validation, email upsert, best-effort Kit sync |
| `public/aoc.html` | The waitlist page (hero, glass form card, countdown, UTM capture) |
| `public/aoc/thanks.html` | Thank-you page with the video slot |
| `next.config.ts` | Added `aoc` to `STATIC_PAGES` + `/aoc/thanks` rewrite (local-dev parity; prod uses `cleanUrls`) |
| `.env.local.example` | Documented `KIT_API_KEY`, `KIT_TAG_ID_AOC_WAITLIST` |
| `package.json` | Added `zod` |

Commits: `8870e72` (migration), `c342474` (API), `6ec76cf` (/aoc), `695a0c7` (/aoc/thanks). UTM capture (Phase 5) ships inside `public/aoc.html` and was delivered with the `/aoc` commit.

## Env vars required

Already present: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.

**New — must be set in Vercel before Kit sync works in prod (server-only):**
- `KIT_API_KEY` — Kit (ConvertKit) v4 API key, sent as `X-Kit-Api-Key`.
- `KIT_TAG_ID_AOC_WAITLIST` — Kit tag id whose application triggers the welcome sequence.

If either is missing, the row is still saved, `kit_synced` stays `false`, and the user still succeeds. Rows with `kit_synced = false` can be backfilled later.

## Verified (acceptance checks)

- ✅ `npm run build` passes (typecheck + lint + gated-page check); `/api/aoc/waitlist` in route table.
- ✅ `/aoc` and `/aoc/thanks` render 200 with all required copy.
- ✅ Submitting creates one `aoc_waitlist` row with correct UTM fields; `source` defaults to `aoc-waitlist` when no `utm_source`.
- ✅ Simulated Kit failure (env unset) → still `200 { ok: true }`, `kit_synced = false`, no provider error leaked.
- ✅ Double-submitting the same email → `200`, no duplicate row (upsert updates first_name + UTM).
- ✅ Countdown identical across `America/New_York`, `Asia/Tokyo`, `Pacific/Auckland`, `UTC`, `America/Los_Angeles` (computed from a fixed UTC instant).
- ✅ `/aoc/thanks` video placeholder (`#aocVideoSlot`) present.
- ⚠️ Mobile "CTA above the fold" is structural (compact mobile hero + form section directly under it) — verified by layout, not pixel-tested in a device browser. Worth a real-device glance.

## Open TODOs (marked in code)

1. **Live event URL** — `public/aoc.html`, the `aocDoorsLink` anchor (`href="#"`) shown in the post-expiry "Doors are open" state. Replace `#` with the real launch/event URL.
2. **Claudio video** — `public/aoc/thanks.html`, the `#aocVideoSlot` block. Drop an `<iframe>`/`<video>` into `.thanks-video-frame` (no rebuild needed; instructions are in the inline comment).
3. **Real AOC logo asset** — `public/aoc.html`, the `.aoc-lockup` text element (and optionally the OG image). Swap the "Agent on Camera" text lockup for the logo when it lands.
4. **Set Kit env vars** in Vercel (`KIT_API_KEY`, `KIT_TAG_ID_AOC_WAITLIST`) so live signups sync + trigger the welcome sequence.

## Notes

- Research lives in `research-aoc.md` (not `research.md` — that file is the active doc for the in-progress Stripe migration; per-task suffixing is this repo's convention).
- The repo validates manually elsewhere; this route uses `zod` per the spec.
