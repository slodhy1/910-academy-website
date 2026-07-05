# AOC /livedemo — Survey Redesign + Earnings-Based Routing + Google Sheets

**Date:** 2026-07-05
**Surface:** `public/aoc/livedemo.html` (frontend state machine) and `src/app/api/aoc/livedemo/route.ts` (backend)
**Status:** Approved design, ready for implementation plan

## Copy rule (applies to everything below)

No em dashes in any user-facing copy. Use periods, commas, "to" for ranges, or parentheses.

## Goal

Turn the /livedemo qualification funnel into an enclosed, premium survey that:

1. Captures full name, email, and phone up front (before the questions).
2. Encloses the whole survey in a rounded, elevated box that sits on top of the current background (the background color stays). The progress bar and Back button move inside the box, next to the "1 / 4" counter.
3. Makes Q3 ("what's most important to improve on") multi-select with a Next button.
4. Routes people by monthly-earnings bucket combined with the invest Yes/No answer, to one of three destinations: a phone follow-up, a team-member Calendly, or the existing Calendly.
5. Writes every lead to two Google Sheets tabs (Call List, Booked Calls) in addition to the existing Supabase row and team email.

## Current state (before)

- 4 tap-to-advance questions. Qualification = earnings >= $5k AND invest = Yes.
- Qualified -> Calendly (`calendly.com/910academy/demo`). Not qualified -> a name + phone "texting" capture.
- Contact info collected only on the texting path.
- Backend: validate -> insert one row into Supabase `aoc_livedemo_submissions` -> email `academy@studio910pb.com`. No Google Sheets anywhere in the repo.

## Flow (after)

The box contains a small AOC logo, a header (progress bar + Back + counter), and the current step's content. Steps:

### Step 0: Contact intro (new)
- Eyebrow: AGENT ON CAMERA. Headline: "Book Your Demo".
- Sub copy (no em dash): "Be first to book your demo. Just enter your name, email, and phone number to get started."
- Fields: Full name (required), Email (required, valid email), Phone number (required, 10 to 15 digits). Honeypot field retained.
- Button: "Continue".
- No progress bar and no Back button here (this is the entry point).
- On submit: validate client-side, store contact in memory, advance to Q1. No network call yet.

### Steps 1 to 4: the questions
- A muted subhead shows once questions begin: "Before your demo, make sure you answer these 4 questions."
- Progress bar spans the top edge of the box; "1 / 4" counter and Back button sit in the box header directly under the bar.
- Q1 (experience): single-select, tap-to-advance. Options unchanged.
- Q2 (monthly earnings): single-select, tap-to-advance. Options unchanged: `$0-$1,000`, `$1,000-$3,000`, `$3,000-$5,000`, `$5,000-$10,000`, `$10,000+`.
- Q3 (focus): text becomes "What's most important for you to improve on to take your business from where it is now to where you want it to be? (select all that apply)". Multi-select. "All of the above" removed. Options: Shooting, Editing, Sales, Team Building. A "Next" button sits underneath, disabled until at least one option is selected.
- Q4 (invest): Yes / No, single-select, tap-to-advance. Answering Q4 triggers routing.
- Q1's Back returns to the contact intro (so a mistyped email can be fixed). Back on Q2 to Q4 goes to the previous question.

### Routing (after Q4)
Earnings -> bucket:
- `$0-$1,000` = LOW
- `$1,000-$3,000` and `$3,000-$5,000` = MID
- `$5,000-$10,000` and `$10,000+` = HIGH

Destination:
| Q4 | Bucket | Destination |
|----|--------|-------------|
| No (any) | any | Phone confirmation |
| Yes | LOW | Phone confirmation |
| Yes | MID | Team demo Calendly: `https://calendly.com/910academy/aoc-live-demo` |
| Yes | HIGH | Existing Calendly: `https://calendly.com/910academy/demo` |

Routing is computed both client-side (to pick the screen instantly, mirroring today's `isQualified` pattern) and server-side (source of truth). The two must stay in sync.

### End states
- **Phone**: confirmation screen. Copy: "You're all set. Our team will reach out to you shortly. Keep an eye on your phone." We already have their number from Step 0, so nothing to re-enter.
- **Calendly (MID or HIGH)**: Calendly inline embed with name and email prefilled via query params (`?name=<full name>&email=<email>`, URL-encoded). A ghost "Already booked? Continue" fallback stays so a completed booking is never a dead end.
- Post-booking screen copy varies by variant: HIGH (existing `/demo`) keeps "You'll be speaking with Claudio Rivera personally on this call." MID (team `/aoc-live-demo`) says "You'll be speaking with a member of our team on this call." No em dashes.
- The "What is AOC" explainer and footer stay below on all end states, unchanged.

## Data model and persistence

### Submission identity
The client generates a `submissionId` (UUID via `crypto.randomUUID()`) at Step 0 and includes it in every POST for this lead, so the two POST moments (below) reference one row.

### POST #1: routing decided (fires right after Q4, for every lead)
Fire-and-forget from the client so the UI never waits. Body: `submissionId`, `fullName`, `email`, `phone`, `q1`, `q2`, `q3` (array), `q4`, plus honeypot `website`.

Server:
1. Origin + honeypot checks (as today).
2. Validate. `email` required and valid. `phone` required (10 to 15 digits). `q3` is a non-empty array of the four focus options.
3. Recompute earnings bucket and destination server-side (never trust the client).
4. Upsert the Supabase row keyed by `submission_id` (insert on first POST).
5. Email the team (existing Resend notify, template updated for the new fields and outcomes).
6. POST to the Apps Script webhook with `action: "append"` and the destination, which appends a row to the correct tab: phone -> "Call List", Calendly -> "Booked Calls" (initial status "Routed").
7. Return `{ ok, destination }`. Email and Sheets failures are logged but never turned into an error for the user (the Supabase row is the durable record).

### POST #2: booking confirmed (Calendly leads only)
Calendly fires `calendly.event_scheduled` in the iframe. On that event (or the fallback button), the client POSTs `submissionId` and `type: "booked_confirmed"`.

Server: update the Supabase row (`booked_at = now()`, status = "Booked") and call the Apps Script webhook with `action: "update"` to find the matching Booked Calls row by `submissionId` and set its status to "Booked". Result: one row per lead, status goes Routed -> Booked. Leads who reach Calendly but abandon still exist in the sheet as "Routed", which is exactly who a setter should chase.

### Supabase migration (0018)
Extend `aoc_livedemo_submissions` (all additive, idempotent):
- add `submission_id uuid` with a unique index (existing rows stay null; Postgres allows multiple nulls under a unique index).
- add `email text`.
- add `calendly text` (null for phone; `team` or `existing` for booked).
- add `booked_at timestamptz`.
- add `status text` (e.g. Routed, Booked; null for phone rows).
- `q3_focus` stays `text` and stores the selected options comma-joined (satisfies the existing NOT NULL, no column-type change).
- `outcome` stays `text`; values become `phone` or `booked`.
- `full_name` and `phone` are now populated for every outcome (previously texting-only).

### Google Sheets via Apps Script
- One spreadsheet, two tabs: "Call List" and "Booked Calls".
- A single Apps Script Web App (deployed by the user) exposes one webhook URL. It handles `action: "append"` (route to tab by outcome) and `action: "update"` (find row by `submissionId`, set status).
- The script is checked into the repo as a paste-ready file (for example `scripts/aoc-livedemo-apps-script.gs`) with a header comment explaining setup: create the sheet and two tabs with headers, paste the script, deploy as a Web App (execute as me, anyone can access), copy the URL.
- Columns per tab include: timestamp, submissionId, full name, email, phone, Q1, Q2, Q3 (joined), Q4, earnings bucket, destination, and (Booked Calls only) calendly variant and status.

### Environment variables
- `AOC_LIVEDEMO_SHEETS_WEBHOOK_URL`: the Apps Script Web App URL.
- `AOC_LIVEDEMO_SHEETS_SECRET`: shared secret sent with each webhook POST; the script rejects requests without it. Both are added to `.env.local` and Vercel; if unset, the webhook step is skipped (Supabase + email still work).

## The box (visual)

- Centered panel, roughly 560 to 600px max width, on top of the existing dark gradient background (unchanged).
- Surface one notch lighter than the background (elevated glass using existing tokens), 24px rounded corners (`--radius-xl`), a hairline border, and a faint accent glow, so it reads premium without a new palette.
- The progress bar moves from fixed-at-viewport-top to the top edge of the box, rounded to match the top corners. The Back button and "1 / 4" counter sit inside the box header just under the bar.
- Mobile: the box keeps a comfortable margin (not edge to edge) and remains within one viewport per step, matching the current dvh-locked behavior.
- Built with the frontend-design skill and iterated live in the browser against the real page.

## Non-goals

- No change to the "What is AOC" explainer, coverflow, accordion, or footer.
- No change to the Supabase access model (service-role writes, RLS on).
- No new "how much will you invest" question. Routing uses the existing monthly-earnings answer.

## Risks and mitigations

- Client and server routing drift: keep the bucket and destination logic in one clearly commented block on each side, mirroring the existing `HIGH_EARNINGS` pattern.
- Apps Script update-by-id latency or failure: it is fire-and-forget and non-blocking; the Supabase row and the initial "Routed" sheet row are the durable records.
- Duplicate submissions (double POST #1): the `submission_id` unique key makes the server upsert idempotent; the Apps Script append should also guard against appending twice for the same id.
