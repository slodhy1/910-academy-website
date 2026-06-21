# AOC Waitlist Landing Page — plan.md

## 1. Objective

Ship a high-desirability waitlist page at `910academy.com/aoc` as fast as reasonably possible. The page captures name and email, fires a welcome sequence, and builds anticipation for the Agent on Camera launch on July 1. The creative drives signups. The page is supportive: simple, low friction, one clear action.

Scope is v1 only. The sneak-peek module strip, the blurred full-module grid page, the live-event landing page, and Claudio's "why" video are explicitly out of scope here and tracked in section 12.

## 2. Architecture

New route on the existing 910academy.com Next.js app. No new app, no new repo.

Two layers:

1. Source of truth: Supabase. The form posts to a Next.js API route that writes every signup to an `aoc_waitlist` table. You own the data. This is the only way to later match Instagram handles and Skool buyers for attribution and paying out setters.
2. Sending engine: Kit (ConvertKit). The same API route upserts the subscriber into Kit and applies the `aoc-waitlist` tag, which triggers the welcome sequence. Kit owns deliverability and lets Claudio and Ryan fire promo broadcasts during launch week without touching code.

Write order is Supabase first (durable record), then Kit (best effort). If Kit fails, the Supabase row persists with `kit_synced = false` and a Vercel Cron job drains the backlog. This protects you from Kit rate limits during a signup spike.

## 3. Prerequisites

a. Existing 910academy.com Next.js app, local checkout, working branch
b. Supabase project already wired to the 910academy app (confirm)
c. Kit account created, sending domain authenticated with SPF, DKIM, and DMARC (confirm). Unauthenticated sending domains land in spam during launch week.
d. Kit `aoc-waitlist` tag created, tag id captured
e. Kit welcome sequence built and set to trigger on the `aoc-waitlist` tag
f. AOC placeholder logo asset or text lockup

### Environment variables

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=        # server only, never exposed to client
KIT_API_KEY=
KIT_TAG_ID_AOC_WAITLIST=
NEXT_PUBLIC_SITE_URL=https://910academy.com
```

## 4. Data layer — Supabase

```sql
create table public.aoc_waitlist (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  email         text not null unique,
  source        text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  kit_subscriber_id  bigint,
  kit_synced    boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.aoc_waitlist enable row level security;
-- No public policies. The API route uses the service role key and bypasses RLS.
```

The `unique` on email makes resubmits idempotent. The API route upserts on conflict so a double-tap returns success, not an error.

## 5. API route contract

`POST /api/aoc/waitlist` (App Router: `app/api/aoc/waitlist/route.ts`)

Request body:
```json
{
  "firstName": "string, required, 1-80 chars",
  "email": "string, required, valid email",
  "utm": { "source": "", "medium": "", "campaign": "", "content": "", "term": "" }
}
```

Steps:
1. Validate with zod. Reject malformed email or empty first name with 400.
2. Upsert into `aoc_waitlist` on conflict (email) do update set first_name and utm fields. Capture the row.
3. Kit upsert subscriber: `POST https://api.kit.com/v4/subscribers` with header `X-Kit-Api-Key`, body `{ "first_name": ..., "email_address": ... }`. Kit returns the existing subscriber instead of erroring on a duplicate email, so no special-casing needed. Capture `subscriber.id`.
4. Kit tag: `POST https://api.kit.com/v4/tags/{KIT_TAG_ID_AOC_WAITLIST}/subscribers/{subscriber.id}` with empty body `{}`. The subscriber must exist first, which step 3 guarantees. Applying the tag triggers the welcome sequence.
5. On Kit success, update the Supabase row with `kit_subscriber_id` and `kit_synced = true`.
6. Return 200 `{ "ok": true }`.

Failure handling:
- If Kit returns 429, do not fail the user. The Supabase row already exists with `kit_synced = false`. Log it. The Vercel Cron reconciliation job retries. Kit allows 120 requests per rolling 60 seconds per key, so a burst from a 50k-follower push can exceed it. The Supabase-first design absorbs this.
- If Kit returns any other error, same path: persist, mark unsynced, log, return ok.
- Never leak provider errors to the client. The user sees success the moment Supabase has the row.

### Reconciliation (Vercel Cron safety net)

Vercel Cron hits `GET /api/aoc/reconcile` every 15 minutes (gated by `CRON_SECRET`): select `aoc_waitlist` where `kit_synced = false` (oldest first, batched), run the create-subscriber and tag calls with exponential backoff (honoring 429 Retry-After), set `kit_synced = true` on success. This guarantees no signup is lost to a Kit rate limit during the spike. Shared logic lives in `src/lib/aoc/reconcile.ts`.

## 6. Opt-in mode decision

Single opt-in (instant, lowest friction) versus double opt-in (Kit sends a confirmation click first). For a waitlist that wants maximum signups and an immediate welcome, single opt-in is the call. Creating the subscriber via the API plus the tag trigger fires the welcome sequence without a confirmation step. Confirm you want single opt-in before build.

## 7. Page spec — `/aoc`

Match the existing 910 Academy design system. Do not invent new tokens. Accent `#38B6FF`, Montserrat, glassmorphism, existing dark base. Reuse existing buttons, inputs, and container components from the 910academy app.

Layout, desktop:
1. Top: AOC placeholder logo lockup, small, centered or top-left
2. Hero headline, large, left-weighted: the headline copy in section 9
3. Centered glass card with the form: first name field, email field, one CTA button in `#38B6FF` as the single eye-magnet on the page
4. Subhead line positioned bottom-right of the hero: "It will be worth the wait"
5. Countdown timer below the form, labeled with the launch moment
6. A single line teasing 120 modules
7. Footer: 910 Academy branding

Mobile: stack in order logo, headline, subhead, form card, countdown, modules tease, footer. Keep the CTA above the fold.

Countdown target: July 1, 2026, 8:00 PM Eastern. July is daylight time so Eastern is UTC-4. Anchor the timer to the fixed instant `2026-07-02T00:00:00Z` so it is timezone-proof regardless of the visitor's clock. On expiry, swap the timer for a "Doors are open" state linking to the live event or Skool (link TBD, placeholder for now).

UTM capture: read `utm_*` query params on page load, hold in state, include in the POST body. This is how you measure which outbound channel and which DM batch converted.

Form behavior: client-side validate, disable button on submit, show inline success state in the card (do not navigate away on error), redirect to `/aoc/thanks` on success.

## 8. Thank-you page spec — `/aoc/thanks`

1. Headline: "You're on the list"
2. Confirmation body reinforcing "It will be worth the wait" and telling them sneak peeks are coming to their inbox
3. Add-to-calendar button for July 1, 8:00 PM ET that works across time zones (generate an `.ics` and a Google Calendar link from the same UTC instant). Claudio flagged the missing add-to-calendar as a recurring miss, so include it here.
4. Placeholder slot for Claudio's "why" video, drops in later without a rebuild
5. AOC branding

## 9. Copy (drafted from the call, Claudio's voice)

### Page

- Logo lockup: AGENT ON CAMERA (placeholder until the logo asset lands)
- Hero headline: THE GAME IS ABOUT TO CHANGE
- Subhead, bottom-right: It will be worth the wait
- Modules tease line: 120 modules. The skill that changes everything. July 1.
- Form labels: First name / Email
- CTA button: Join the Waitlist
- Microcopy under button: First access the moment the doors open. Nothing else.
- Countdown label: Doors open July 1, 8:00 PM ET

### Thank-you page

- Headline: You're on the list
- Body: You're in. The game is about to change, and you'll be among the first through the doors on July 1. Watch your inbox over the next few weeks. I'm going to show you exactly what's coming, piece by piece. It will be worth the wait.
- Calendar button: Add the launch to my calendar

### Welcome email (v1 draft, refine with Claudio's journaling input)

Subject: You're in. Now let me tell you why this matters.

Body:
I want to tell you something I kept quiet for a long time.

Right before all of this, I was a cashier making thirteen dollars an hour. That was my life. If I had listened to the people who say don't buy the hype, be realistic, that kind of success is for someone else, I'd still be standing behind that counter.

I didn't listen. I bet on one skill. And it changed everything.

Two years ago I started teaching pieces of it for free, and the game shifted. People around the world built real businesses off it. But free only gets you entry-level. It's surface. What's coming on July 1 is the whole thing. 120 modules. Mastery, not a taste.

You already did the most important part. You raised your hand. Over the next few weeks I'm going to show you what's inside, bit by bit. Stay close to your inbox.

The game is about to change.

It will be worth the wait.

Claudio

Note: this draft uses the Lowe's-cashier story and the don't-buy-the-hype reframe straight from the call. Claudio agreed to journal from inspiring moments and send raw material. Swap his lines in when they arrive. Keep the close on "It will be worth the wait."

## 10. Validation checklist before ship

a. Form submits, Supabase row appears with correct utm fields
b. Kit subscriber created, `aoc-waitlist` tag applied, welcome sequence fires to a test inbox
c. Welcome email lands in inbox, not spam (test Gmail, Outlook, iCloud)
d. Countdown reads correctly from a non-Eastern timezone
e. Double submit of the same email returns success, no error, no duplicate row
f. Thank-you page loads, add-to-calendar produces a correct July 1 8:00 PM ET event
g. Mobile layout holds, CTA above the fold
h. Kit failure simulated: row persists with `kit_synced = false`, user still sees success

## 11. Build order

1. Supabase table and RLS
2. API route with zod validation and Supabase upsert
3. Kit create-and-tag calls wired into the route
4. `/aoc` page and form, brand-matched
5. Countdown component
6. `/aoc/thanks` page and add-to-calendar
7. UTM capture
8. Run the section 10 checklist
9. Ship
10. Vercel Cron reconciliation route (`/api/aoc/reconcile`)

## 12. Out of scope (v2 and later)

- Sneak-peek preview strip at the bottom of the waitlist page
- Full module grid page with 50 percent Gaussian-blur video and AOC logo, dripped one to three minute previews
- Live-event landing page for the cold outbound "sleeping giant" push to non-real-estate videographers
- Claudio "why" video production for the thank-you page
- Avatar segmentation and post-launch ad campaigns by tag

## 13. Open items to confirm before the execute prompt

1. Kit account exists and sending domain is authenticated (SPF, DKIM, DMARC)
2. Supabase project is wired to the 910academy app
3. Single opt-in confirmed
4. `KIT_TAG_ID_AOC_WAITLIST` value once the tag is created
5. AOC placeholder logo: text lockup acceptable for v1, or is an asset coming

---

# Performance Optimization Pass (2026-06-21)

**Goal:** mobile Safari load ~8s → LCP < 2.5s on `/aoc` and `/aoc/preview`.

## Architecture reality (matters for the asks)
- `/aoc` is a **static HTML file** (`public/aoc.html`), not React. `next/image`,
  `next/dynamic`, and `next/font` cannot run there — but every *goal* is met with
  vanilla equivalents (poster `<img>`, deferred `<script>`, `@font-face` + `swap`).
  Staying static is itself an LCP win (no framework JS / hydration).
- `/aoc/preview` **is** App Router (all server components, already next/image,
  lazy grid, no video). Already near-optimal; the lever is the global image config.

## Measured bottleneck (current)
On mobile the hero JS **still downloads + plays the 1.1 MB video** (the skip only
covers reduced-motion/save-data). Plus a 66 KB Turnstile script on every page view.
The 40 KB poster is preloaded but competes with the video for bandwidth.

## Fixes (one commit each)
1. **next.config: `images.formats = ['image/avif','image/webp']`** — smaller files
   from next/image on `/aoc/preview`. *(no JS-bundle change)*
2. **Poster-first hero, no video on mobile** — poster becomes an explicit `<img>`
   LCP element (responsive `srcset`/`sizes`, `fetchpriority="high"`, reserved 16:9
   so no CLS). On ≤768px the video is **never attached** (poster only, optional
   tap-to-play). Desktop attaches the source only after first paint. *(biggest win:
   removes ~1.1 MB from the mobile critical path)*
3. **Defer Turnstile to modal-open** — drop the `<head>` script; load it the first
   time the waitlist modal opens. Removes 66 KB + its execution from initial load;
   bot protection unchanged (loads when the form is actually used).

## Out of scope / already done
- Fonts already self-hosted with `display: swap` on both pages (the vanilla/CSS-module
  equivalent of `next/font`) — no render-blocking font fetch. next/font on the React
  page is cosmetic, skipped.
- `/aoc/preview` already static + server components + next/image; grid stays lazy.
- No add-to-calendar / heavy client component lives on either page (it's on
  `/aoc/thanks`), so there's nothing to `next/dynamic` here.
- Hero assets `aoc-header.mp4` (3.1 MB, +faststart) and `aoc-header.webp`/`-sm.webp`
  posters are already compressed; swap to a smaller file trivially if one is provided.

## Expected impact
Mobile `/aoc` critical-path bytes: ~1.17 MB → ~0.04 MB (poster only) before any
below-fold lazy loads. LCP element is the preloaded 40 KB poster → well under 2.5 s.
`/aoc/preview` First Load JS unchanged (no client JS added); images served as avif.

## Verify
Production build (route static + First Load JS before/after), `tsc --noEmit`, lint.
