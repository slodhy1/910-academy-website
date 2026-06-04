# Agent on Camera (AOC) waitlist — build primer

Email-only waitlist for the **Agent on Camera** launch (doors open **July 1, 2026, 8:00 PM ET** = `2026-07-02T00:00:00Z`). Page → `/api/aoc/waitlist` → Supabase (durable) + Kit (best-effort) → `/aoc/thanks`.

## What was built

**Architecture decision:** 910academy.com's public site is **static HTML in `/public`** (the React/shadcn components are portal-only — `/account`, `/admin`). To look native, `/aoc` was built as static HTML on the canonical token system, not as a shadcn App Router page. The only Next.js piece is the API route. See `research-aoc.md` for the full rationale.

**Format:** long-form, conversion-style landing page modeled on the structure of `masterclass.imaccelerator.com`. It is **standalone** — intentionally NO site nav, and a minimal footer (no socials, no "Built by" credit) — so it reads as its own funnel page, separate from the main site.

- **`/aoc`** — section flow: hero (lockup → urgency count-bar → "THE GAME IS ABOUT TO CHANGE" headline → subhead → CTA) → trust bar → "What's inside" benefit cards (homepage `perk-card` style) → before/after → coach bio → WHAT/WHEN/WHERE details → final CTA with countdown. The **CTA is a button — "Save My Seat" (×9)** — that opens an **email-capture modal** (the-6ix modal pattern: backdrop + Esc close, body-scroll lock, focus first input). Modal collects First name + Email, captures UTM, POSTs to `/api/aoc/waitlist`, redirects to `/aoc/thanks`. Timezone-correct countdown (multiple synced instances) swaps to "Doors are open" on expiry. CTA is the only accent eye-magnet.
- **`/aoc/thanks`** — standalone "You're on the list." confirmation (no nav) with the spec copy + a swappable Claudio video slot (`#aocVideoSlot`).
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

1. **Real social proof** — `public/aoc.html`, the trust bar + testimonials. Currently honest placeholder copy only (no fabricated stats). Add real member numbers / ratings / testimonials when available.
2. **Claudio bio + photo** — `public/aoc.html`, the "Who is Claudio" section (`.coach-body` copy + `.coach-photo` placeholder). Drop in the real story, verified numbers, and a photo (e.g. `/images/claudio.webp`).
3. **Confirm positioning/audience** — a couple of benefit lines and the "Built For You" card are marked TODO; tighten once the exact AOC audience is locked.
4. **"Where" / platform** — `public/aoc.html`, the WHERE detail box currently says "Online — details land in your inbox." Confirm platform/live URL.
5. **Claudio video** — `public/aoc/thanks.html`, the `#aocVideoSlot` block. Drop an `<iframe>`/`<video>` in (instructions in the inline comment).
6. **Real AOC logo asset** — `public/aoc.html`, the `.aoc-lockup` text element (and OG image). Swap the text lockup for the logo when it lands.
7. **Set Kit env vars** in Vercel (`KIT_API_KEY`, `KIT_TAG_ID_AOC_WAITLIST`) so live signups sync + trigger the welcome sequence.

## Notes

- Research lives in `research-aoc.md` (not `research.md` — that file is the active doc for the in-progress Stripe migration; per-task suffixing is this repo's convention).
- The repo validates manually elsewhere; this route uses `zod` per the spec.
