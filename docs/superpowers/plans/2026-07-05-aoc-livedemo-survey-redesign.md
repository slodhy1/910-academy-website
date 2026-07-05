# AOC /livedemo Survey Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the /livedemo funnel as an enclosed premium survey that captures name/email/phone up front, uses multi-select Q3, routes by earnings bucket x invest to phone / team Calendly / existing Calendly, and writes every lead to two Google Sheets tabs alongside the existing Supabase row and team email.

**Architecture:** The frontend is a single static file (`public/aoc/livedemo.html`) driven by a `data-state` state machine. The backend is one Next.js route handler that validates, upserts one Supabase row keyed by a client `submissionId`, emails the team, and (non-blocking) POSTs to a Google Apps Script Web App that appends/updates the sheet tabs. Routing is computed on both sides from the same table; the server is source of truth.

**Tech Stack:** Static HTML/CSS/JS (no framework, no build for the page), Next.js App Router route handler (`nodejs` runtime), Zod, Supabase service-role client, Resend, Google Apps Script.

## Global Constraints

- No em dashes in any user-facing copy. Use periods, commas, "to" for ranges, or parentheses.
- Frontend page is plain HTML/CSS/vanilla JS (ES5-ish, matches the existing file). No new dependencies for the page.
- Client routing logic MUST mirror the server exactly (same buckets, same destinations).
- Supabase writes go through the service-role admin client only; RLS stays on.
- Sheets sync is non-blocking and optional: if the two env vars are unset, Supabase + email still succeed.
- Existing Calendly for HIGH bucket: `https://calendly.com/910academy/demo`. Team Calendly for MID bucket: `https://calendly.com/910academy/aoc-live-demo`.
- Earnings buckets: `$0-$1,000` = LOW; `$1,000-$3,000` and `$3,000-$5,000` = MID; `$5,000-$10,000` and `$10,000+` = HIGH.

---

## File Structure

- Create: `supabase/migrations/0018_aoc_livedemo_contact_routing.sql` (additive schema)
- Create: `scripts/apply-aoc-livedemo-0018-migration.mjs` (applies the migration)
- Create: `src/lib/aoc/livedemo-sheets.ts` (non-blocking Apps Script webhook client)
- Create: `scripts/aoc-livedemo-apps-script.gs` (paste-ready Apps Script for the user)
- Modify: `src/app/api/aoc/livedemo/route.ts` (new schema, routing, upsert, sheets)
- Modify: `src/lib/email/aoc-livedemo-notify.ts` (new fields/outcomes in the email)
- Modify: `.env.local.example` (document the two new env vars)
- Modify: `public/aoc/livedemo.html` (box UI, contact step, multi-select Q3, routing, two POSTs)

---

## Task 1: Supabase migration 0018 (contact + routing columns)

**Files:**
- Create: `supabase/migrations/0018_aoc_livedemo_contact_routing.sql`
- Create: `scripts/apply-aoc-livedemo-0018-migration.mjs`

**Interfaces:**
- Produces: table `aoc_livedemo_submissions` gains columns `submission_id uuid` (unique), `email text`, `calendly text`, `booked_at timestamptz`, `status text`. `outcome` values become `phone|booked`; `q3_focus` stores a comma-joined string; `full_name`/`phone` populated for all outcomes.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0018_aoc_livedemo_contact_routing.sql`:

```sql
-- /aoc/livedemo · Part 2: upfront contact capture + earnings-based routing.
-- Additive + idempotent. Extends 0017 for:
--   * name/email/phone captured on EVERY outcome (previously texting-only)
--   * multi-select Q3 (stored comma-joined in q3_focus; no column-type change)
--   * earnings-bucket routing -> phone / team Calendly / existing Calendly
--   * Booked-Calls status tracking (Routed -> Booked) via a client submission_id
-- outcome values are now 'phone' | 'booked' (was 'texting' | 'booked'); plain text, no change needed.
--
-- Apply: node --env-file=.env.local scripts/apply-aoc-livedemo-0018-migration.mjs

alter table public.aoc_livedemo_submissions
  add column if not exists submission_id uuid,
  add column if not exists email text,
  add column if not exists calendly text,        -- 'team' | 'existing' (booked rows only)
  add column if not exists booked_at timestamptz,
  add column if not exists status text;          -- 'Routed' | 'Booked' (booked rows only)

-- One row per lead, keyed by the client-generated submission_id (nulls allowed for legacy rows).
create unique index if not exists aoc_livedemo_submissions_submission_id_key
  on public.aoc_livedemo_submissions (submission_id);
```

- [ ] **Step 2: Write the apply script**

Create `scripts/apply-aoc-livedemo-0018-migration.mjs` (mirrors `apply-aoc-livedemo-migration.mjs`):

```js
#!/usr/bin/env node
/**
 * /aoc/livedemo · apply 0018_aoc_livedemo_contact_routing.sql to Supabase.
 *
 * Usage: node --env-file=.env.local scripts/apply-aoc-livedemo-0018-migration.mjs
 *
 * Requires SUPABASE_DB_URL (direct connection string, port 5432).
 * Idempotent: re-running is a no-op (add column if not exists / create index if not exists).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL not set.");
  process.exit(1);
}

const sqlPath = path.resolve("supabase/migrations/0018_aoc_livedemo_contact_routing.sql");
const sql = readFileSync(sqlPath, "utf-8");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("✓ connected");

try {
  await client.query(sql);
  console.log(`✓ migration applied (${path.basename(sqlPath)})`);

  const { rows } = await client.query(
    `select column_name, data_type, is_nullable
     from information_schema.columns
     where table_schema = 'public' and table_name = 'aoc_livedemo_submissions'
     order by ordinal_position`
  );
  console.log("\naoc_livedemo_submissions columns:");
  for (const r of rows) {
    console.log(`  ${r.column_name.padEnd(20)} ${r.data_type.padEnd(28)} ${r.is_nullable === "YES" ? "NULL" : "NOT NULL"}`);
  }
} finally {
  await client.end();
}
```

- [ ] **Step 3: Apply the migration**

Run: `node --env-file=.env.local scripts/apply-aoc-livedemo-0018-migration.mjs`
Expected: prints `migration applied` and a column list including `submission_id`, `email`, `calendly`, `booked_at`, `status`. (If `SUPABASE_DB_URL` is not set locally, apply later before deploy; the frontend/backend still typecheck without it.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0018_aoc_livedemo_contact_routing.sql scripts/apply-aoc-livedemo-0018-migration.mjs
git commit -m "aoc/livedemo: migration 0018 — contact + routing columns"
```

---

## Task 2: Backend route + Sheets client + email notify

**Files:**
- Create: `src/lib/aoc/livedemo-sheets.ts`
- Modify: `src/app/api/aoc/livedemo/route.ts`
- Modify: `src/lib/email/aoc-livedemo-notify.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces (route contract consumed by the frontend in Task 4):
  - `POST /api/aoc/livedemo` body `{ type:"submit", submissionId, fullName, email, phone, q1, q2, q3:string[], q4 }` -> `{ ok:true, destination:"phone"|"team"|"existing" }`
  - `POST /api/aoc/livedemo` body `{ type:"booked_confirmed", submissionId }` -> `{ ok:true }`
- Produces: `syncLivedemoSheet(payload)` from `src/lib/aoc/livedemo-sheets.ts`.
- Produces: `sendAocLivedemoNotify(params)` with new fields.
- Consumes: `createAdminClient()` from `@/lib/supabase/admin`.

- [ ] **Step 1: Write the Sheets webhook client**

Create `src/lib/aoc/livedemo-sheets.ts`:

```ts
// Non-blocking Google Sheets sync for /aoc/livedemo via a Google Apps Script Web App.
// One webhook URL, two actions:
//   append -> add a row to the "Call List" (phone) or "Booked Calls" (calendly) tab
//   update -> find the Booked Calls row by submissionId and set its status
// If the env vars are unset, every call is a no-op: Supabase + email remain the record.

export type SheetAppend = {
  action: "append";
  submissionId: string;
  fullName: string;
  email: string;
  phone: string;
  q1: string;
  q2: string;
  q3: string; // comma-joined
  q4: string;
  bucket: string; // LOW | MID | HIGH
  destination: string; // phone | team | existing
  outcome: string; // phone | booked
  status: string; // "" for phone, "Routed" for booked
};

export type SheetUpdate = {
  action: "update";
  submissionId: string;
  status: string; // "Booked"
  bookedAt: string; // ISO
};

export async function syncLivedemoSheet(payload: SheetAppend | SheetUpdate): Promise<void> {
  const url = process.env.AOC_LIVEDEMO_SHEETS_WEBHOOK_URL;
  const secret = process.env.AOC_LIVEDEMO_SHEETS_SECRET;
  if (!url || !secret) return; // sheets sync disabled
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret }),
    });
    if (!res.ok) console.error("[livedemo-sheets] non-2xx:", res.status);
  } catch (e) {
    console.error("[livedemo-sheets] failed:", e instanceof Error ? e.message : String(e));
  }
}
```

- [ ] **Step 2: Rewrite the route handler**

Replace the body of `src/app/api/aoc/livedemo/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAocLivedemoNotify } from "@/lib/email/aoc-livedemo-notify";
import { syncLivedemoSheet } from "@/lib/aoc/livedemo-sheets";

export const runtime = "nodejs";

// The quiz answer literals MUST stay in sync with public/aoc/livedemo.html.
const Q1 = z.enum(["Haven't started yet", "0-1 years", "1-3 years", "3+ years"]);
const Q2 = z.enum(["$0-$1,000", "$1,000-$3,000", "$3,000-$5,000", "$5,000-$10,000", "$10,000+"]);
const Q3Item = z.enum(["Shooting", "Editing", "Sales", "Team Building"]);
const Q4 = z.enum(["Yes", "No"]);

const phone = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .max(40)
  .refine((v) => {
    const d = v.replace(/\D/g, "");
    return d.length >= 10 && d.length <= 15;
  }, { message: "Valid phone number required" });

const BodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("submit"),
    submissionId: z.string().uuid(),
    fullName: z.string().trim().min(1, "Full name is required").max(200),
    email: z.string().trim().email("Valid email required").max(200),
    phone,
    q1: Q1,
    q2: Q2,
    q3: z.array(Q3Item).min(1, "Pick at least one focus area"),
    q4: Q4,
  }),
  z.object({
    type: z.literal("booked_confirmed"),
    submissionId: z.string().uuid(),
  }),
]);

type Bucket = "LOW" | "MID" | "HIGH";
function earningsBucket(q2: z.infer<typeof Q2>): Bucket {
  if (q2 === "$0-$1,000") return "LOW";
  if (q2 === "$1,000-$3,000" || q2 === "$3,000-$5,000") return "MID";
  return "HIGH"; // $5,000-$10,000 | $10,000+
}

type Destination = "phone" | "team" | "existing";
function routeDestination(q2: z.infer<typeof Q2>, q4: z.infer<typeof Q4>): Destination {
  if (q4 === "No") return "phone";
  const b = earningsBucket(q2);
  if (b === "LOW") return "phone";
  if (b === "MID") return "team";
  return "existing";
}

const ALLOWED_HOSTS = new Set([
  "www.910academy.com",
  "910academy.com",
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
]);

function isAllowedOrigin(req: Request): boolean {
  const source = req.headers.get("origin") || req.headers.get("referer");
  if (!source) return false;
  let host: string;
  try {
    host = new URL(source).host;
  } catch {
    return false;
  }
  if (ALLOWED_HOSTS.has(host)) return true;
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    console.warn("[aoc/livedemo] rejected: bad origin");
    return NextResponse.json({ ok: true });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot: hidden `website` field. Bots fill it; humans never see it.
  if (raw && typeof raw === "object" && String((raw as Record<string, unknown>).website ?? "").trim() !== "") {
    console.warn("[aoc/livedemo] rejected: honeypot tripped");
    return NextResponse.json({ ok: true });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const sb = createAdminClient();

  // --- Second POST: a Calendly booking completed. Stamp the existing row. ---
  if (parsed.data.type === "booked_confirmed") {
    const bookedAt = new Date().toISOString();
    const { error } = await sb
      .from("aoc_livedemo_submissions")
      .update({ booked_at: bookedAt, status: "Booked" })
      .eq("submission_id", parsed.data.submissionId);
    if (error) console.error("[aoc/livedemo] booked_confirmed update failed:", error);
    await syncLivedemoSheet({ action: "update", submissionId: parsed.data.submissionId, status: "Booked", bookedAt });
    return NextResponse.json({ ok: true });
  }

  // --- First POST: routing decided. Upsert the lead + fan out. ---
  const d = parsed.data;
  const bucket = earningsBucket(d.q2);
  const destination = routeDestination(d.q2, d.q4);
  const outcome = destination === "phone" ? "phone" : "booked";
  const calendly = destination === "phone" ? null : destination; // 'team' | 'existing'
  const q3Joined = d.q3.join(", ");

  const { error } = await sb
    .from("aoc_livedemo_submissions")
    .upsert(
      {
        submission_id: d.submissionId,
        q1_experience: d.q1,
        q2_earnings: d.q2,
        q3_focus: q3Joined,
        q4_invest: d.q4,
        qualified: destination === "existing", // top-tier lead (HIGH bucket + Yes)
        outcome,
        full_name: d.fullName,
        email: d.email,
        phone: d.phone,
        calendly,
        status: outcome === "booked" ? "Routed" : null,
      },
      { onConflict: "submission_id" }
    );

  if (error) {
    console.error("[aoc/livedemo] upsert failed:", error);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }

  // Email + Sheets are best-effort; a failure never blocks the saved lead.
  const notify = await sendAocLivedemoNotify({
    q1: d.q1, q2: d.q2, q3: q3Joined, q4: d.q4,
    fullName: d.fullName, email: d.email, phone: d.phone,
    bucket, destination, outcome,
  });
  if (!notify.success) console.error("[aoc/livedemo] notify failed:", notify.error);

  await syncLivedemoSheet({
    action: "append",
    submissionId: d.submissionId,
    fullName: d.fullName, email: d.email, phone: d.phone,
    q1: d.q1, q2: d.q2, q3: q3Joined, q4: d.q4,
    bucket, destination, outcome,
    status: outcome === "booked" ? "Routed" : "",
  });

  return NextResponse.json({ ok: true, destination });
}
```

- [ ] **Step 3: Update the email notify template**

Replace `src/lib/email/aoc-livedemo-notify.ts` with:

```ts
import { Resend } from "resend";

// Admin notification for the /aoc/livedemo funnel. Fires on the first POST
// (routing decided) for every lead. Template is INLINED (no emails/*.html file).
const ADMIN_EMAIL = "academy@studio910pb.com";

export type LivedemoNotifyParams = {
  q1: string;
  q2: string;
  q3: string; // comma-joined
  q4: string;
  fullName: string;
  email: string;
  phone: string;
  bucket: string; // LOW | MID | HIGH
  destination: string; // phone | team | existing
  outcome: string; // phone | booked
};

export type SendResult =
  | { success: true; id: string }
  | { success: false; error: string };

const DEST_LABEL: Record<string, string> = {
  phone: "Phone follow-up (Call List)",
  team: "Team demo Calendly (Booked Calls)",
  existing: "Existing Calendly (Booked Calls)",
};

export async function sendAocLivedemoNotify(p: LivedemoNotifyParams): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { success: false, error: "RESEND_API_KEY or EMAIL_FROM not set" };
  }

  const tag = p.outcome === "booked" ? "CALL" : "PHONE";
  const subject = `[AOC Demo] ${tag} · ${p.fullName.trim()} · ${p.phone.trim()}`.trim();

  const row = (label: string, val: string) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#666;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 0;color:#111;font-weight:600;">${escapeHtml(val)}</td></tr>`;

  const html =
    `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;"><tr><td align="center">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">` +
    `<tr><td style="background:#0a0a0a;padding:20px 28px;">` +
    `<span style="color:#38B6FF;font-weight:700;letter-spacing:.12em;font-size:12px;text-transform:uppercase;">Agent On Camera, Demo Funnel</span>` +
    `<div style="color:#fff;font-size:20px;font-weight:800;margin-top:6px;">${p.outcome === "booked" ? "New demo lead (booking)" : "New demo lead (call list)"}</div>` +
    `</td></tr>` +
    `<tr><td style="padding:24px 28px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.5;">` +
    row("Name", p.fullName) +
    row("Email", p.email) +
    row("Phone", p.phone) +
    row("Routed to", DEST_LABEL[p.destination] ?? p.destination) +
    `<tr><td colspan="2" style="border-top:1px solid #eee;padding-top:12px;"></td></tr>` +
    row("Q1 · Time in business", p.q1) +
    row("Q2 · Monthly earnings", `${p.q2} (${p.bucket})`) +
    row("Q3 · Focus areas", p.q3) +
    row("Q4 · Willing to invest", p.q4) +
    row("Submitted", new Date().toISOString()) +
    `</table></td></tr></table></td></tr></table></body></html>`;

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: ADMIN_EMAIL, subject, html });
    if (error) {
      console.error("[aoc-livedemo-notify] Resend error:", error);
      return { success: false, error: error.message ?? String(error) };
    }
    if (!data?.id) return { success: false, error: "Resend returned no id" };
    console.log(`[aoc-livedemo-notify] sent id=${data.id}`);
    return { success: true, id: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[aoc-livedemo-notify] threw:", message);
    return { success: false, error: message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

- [ ] **Step 4: Document the env vars**

Append to `.env.local.example`:

```bash
# /aoc/livedemo Google Sheets sync (Apps Script Web App). Leave unset to disable
# sheet writes (Supabase + email still work). See scripts/aoc-livedemo-apps-script.gs.
AOC_LIVEDEMO_SHEETS_WEBHOOK_URL=
AOC_LIVEDEMO_SHEETS_SECRET=
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `src/app/api/aoc/livedemo/route.ts`, `src/lib/aoc/livedemo-sheets.ts`, `src/lib/email/aoc-livedemo-notify.ts`.

- [ ] **Step 6: Smoke-test the route against dev**

Start dev (`npm run dev`) in one shell, then in another run these and confirm the `destination` in each response:

```bash
BASE=http://localhost:3000/api/aoc/livedemo
H='-H content-type:application/json -H origin:http://localhost:3000'
UID(){ node -e "console.log(crypto.randomUUID())"; }

# LOW + Yes -> phone
curl -s $H $BASE -d "{\"type\":\"submit\",\"submissionId\":\"$(UID)\",\"fullName\":\"A\",\"email\":\"a@b.com\",\"phone\":\"5551234567\",\"q1\":\"1-3 years\",\"q2\":\"$0-$1,000\",\"q3\":[\"Sales\"],\"q4\":\"Yes\"}"
# MID + Yes -> team
curl -s $H $BASE -d "{\"type\":\"submit\",\"submissionId\":\"$(UID)\",\"fullName\":\"A\",\"email\":\"a@b.com\",\"phone\":\"5551234567\",\"q1\":\"1-3 years\",\"q2\":\"$3,000-$5,000\",\"q3\":[\"Sales\"],\"q4\":\"Yes\"}"
# HIGH + Yes -> existing
curl -s $H $BASE -d "{\"type\":\"submit\",\"submissionId\":\"$(UID)\",\"fullName\":\"A\",\"email\":\"a@b.com\",\"phone\":\"5551234567\",\"q1\":\"1-3 years\",\"q2\":\"$10,000+\",\"q3\":[\"Sales\"],\"q4\":\"Yes\"}"
# HIGH + No -> phone
curl -s $H $BASE -d "{\"type\":\"submit\",\"submissionId\":\"$(UID)\",\"fullName\":\"A\",\"email\":\"a@b.com\",\"phone\":\"5551234567\",\"q1\":\"1-3 years\",\"q2\":\"$10,000+\",\"q3\":[\"Sales\"],\"q4\":\"No\"}"
```

Expected destinations, in order: `phone`, `team`, `existing`, `phone`. (Rows also upsert to Supabase and, if env is set, to the sheet. If Supabase env is missing locally the upsert 500s but the routing is still visible in server logs; re-run once envs are present.)

- [ ] **Step 7: Commit**

```bash
git add src/app/api/aoc/livedemo/route.ts src/lib/aoc/livedemo-sheets.ts src/lib/email/aoc-livedemo-notify.ts .env.local.example
git commit -m "aoc/livedemo: backend — routing, upsert, sheets sync, richer notify"
```

---

## Task 3: Google Apps Script (paste-ready)

**Files:**
- Create: `scripts/aoc-livedemo-apps-script.gs`

**Interfaces:**
- Consumes: the JSON body shapes produced by `syncLivedemoSheet` in Task 2 (`action:"append"` and `action:"update"`, both carrying `secret`).

- [ ] **Step 1: Write the Apps Script**

Create `scripts/aoc-livedemo-apps-script.gs`:

```javascript
/**
 * /aoc/livedemo — Google Sheets sync endpoint.
 *
 * SETUP
 *  1. Create a Google Sheet with two tabs named exactly:  Call List   Booked Calls
 *     Put this header row (row 1) on BOTH tabs:
 *       Timestamp | Submission ID | Name | Email | Phone | Q1 | Q2 | Q3 | Q4 | Bucket | Destination | Status
 *  2. Extensions -> Apps Script. Paste this file. Set SECRET below to a long random string.
 *  3. Deploy -> New deployment -> Web app. Execute as: Me. Who has access: Anyone.
 *     Copy the Web app URL.
 *  4. In the site env: AOC_LIVEDEMO_SHEETS_WEBHOOK_URL = that URL,
 *     AOC_LIVEDEMO_SHEETS_SECRET = the same SECRET string.
 */

var SECRET = "PASTE_A_LONG_RANDOM_STRING_HERE";
var CALL_TAB = "Call List";
var BOOKED_TAB = "Booked Calls";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== SECRET) {
      return json({ ok: false, error: "unauthorized" });
    }
    if (body.action === "append") return handleAppend(body);
    if (body.action === "update") return handleUpdate(body);
    return json({ ok: false, error: "unknown action" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function handleAppend(b) {
  var tabName = b.outcome === "booked" ? BOOKED_TAB : CALL_TAB;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  // Idempotency: skip if this submissionId is already present (col B).
  if (findRowById(sheet, b.submissionId) > 0) return json({ ok: true, deduped: true });
  sheet.appendRow([
    new Date(), b.submissionId, b.fullName, b.email, b.phone,
    b.q1, b.q2, b.q3, b.q4, b.bucket, b.destination, b.status || "",
  ]);
  return json({ ok: true });
}

function handleUpdate(b) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BOOKED_TAB);
  var row = findRowById(sheet, b.submissionId);
  if (row > 0) sheet.getRange(row, 12).setValue(b.status || "Booked"); // col 12 = Status
  return json({ ok: true, updated: row > 0 });
}

function findRowById(sheet, id) {
  if (!id) return -1;
  var ids = sheet.getRange(2, 2, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 2: Commit** (no runtime verification here; the user deploys it)

```bash
git add scripts/aoc-livedemo-apps-script.gs
git commit -m "aoc/livedemo: paste-ready Apps Script for the two Sheets tabs"
```

---

## Task 4: Frontend rewrite (box, contact step, multi-select Q3, routing)

**Files:**
- Modify: `public/aoc/livedemo.html`

**Interfaces:**
- Consumes: `POST /api/aoc/livedemo` contract from Task 2.
- Produces: nothing consumed by later tasks (final task).

This task edits one file in three ordered passes (CSS, then HTML, then JS). The deliverable is the fully working page, verified in the browser at the end.

### Pass A: constants + CSS

- [ ] **Step 1: Add the team Calendly constant**

In the head `<script>` (currently defining `CALENDLY_URL`), replace that block with:

```html
<script>
  // HIGH bucket ($5k+) qualified leads book here (Claudio).
  const CALENDLY_EXISTING_URL = "https://calendly.com/910academy/demo";
  // MID bucket ($1k to $5k) leads book a team-member demo here.
  const CALENDLY_TEAM_URL = "https://calendly.com/910academy/aoc-live-demo";
  // STATE post-booking reschedule link (optional).
  const CALENDLY_RESCHEDULE_URL = "";
</script>
```

- [ ] **Step 2: Update state-visibility CSS**

Replace the `===== STATE VISIBILITY =====` block (currently listing `#s-quiz, #s-booking, #s-texting, #s-postbook, #whatis`) with:

```css
/* ===== STATE VISIBILITY — the whole page is one state machine ===== */
#s-survey, #s-phone, #s-booking, #s-postbook, #whatis { display: none; }
/* The enclosed survey box holds the contact step AND the four questions. */
body[data-state="contact"] #s-survey,
body[data-state="quiz"]    #s-survey    { display: block; }
body[data-state="phone"]    #s-phone    { display: block; }
body[data-state="booking"]  #s-booking  { display: block; }
body[data-state="postbook"] #s-postbook { display: block; }
/* Within the survey box, swap contact panel vs quiz panel. */
#step-contact, #step-quiz { display: none; }
body[data-state="contact"] #step-contact { display: block; }
body[data-state="quiz"]    #step-quiz    { display: block; }
/* Progress bar + header (back + count) belong to the quiz sub-state only.
   visibility (not display) keeps the box top from shifting between steps. */
.survey-topbar, .survey-head { visibility: hidden; }
body[data-state="quiz"] .survey-topbar,
body[data-state="quiz"] .survey-head { visibility: visible; }
/* "What is AOC" appears on the end states only, never during the survey. */
body[data-state="phone"]    #whatis,
body[data-state="booking"]  #whatis,
body[data-state="postbook"] #whatis { display: block; }
```

- [ ] **Step 3: Add the box CSS**

Immediately after the `===== STATE 1 — QUIZ =====` comment block's existing rules (before `/* ===== STATE 3 — texting form ===== */`), add:

```css
/* ===== ENCLOSED SURVEY BOX (contact + quiz) ===== */
.survey-box {
  position: relative; width: 100%; max-width: 600px; margin: 0 auto;
  background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.03));
  border: 1px solid var(--border-hover);
  border-radius: var(--radius-xl);
  box-shadow: 0 30px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(56,182,255,0.05), inset 0 1px 0 rgba(255,255,255,0.06);
  overflow: hidden; text-align: left;
}
.survey-topbar { height: 5px; width: 100%; background: rgba(255,255,255,0.08); }
.survey-topbar-fill { height: 100%; width: 0%; background: var(--accent); box-shadow: 0 0 12px rgba(56,182,255,0.6); transition: width .45s var(--ease-out); }
.survey-head { display: flex; align-items: center; gap: 12px; padding: var(--space-5) var(--space-6) 0; }
.survey-back { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--fg-muted); background: rgba(255,255,255,0.05); border: 1px solid var(--border); transition: color .2s var(--ease-smooth), border-color .2s var(--ease-smooth), background .2s var(--ease-smooth); }
.survey-back:hover { color: var(--fg); border-color: var(--accent-border); background: var(--accent-subtle); }
.survey-count { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); }
.survey-body { padding: var(--space-6) var(--space-6) var(--space-8); }
.survey-sub { color: var(--fg-dim); font-size: 0.85rem; font-weight: 600; letter-spacing: 0.02em; margin-bottom: var(--space-5); }
.contact-title { font-size: clamp(1.3rem, 4.6vw, 1.9rem); font-weight: 700; line-height: 1.2; margin-bottom: var(--space-3); }
.contact-sub { color: var(--fg-muted); font-size: 0.98rem; line-height: 1.5; margin-bottom: var(--space-6); }
/* Contact form reuses .ld-form inputs but is full-width inside the box. */
.survey-body .ld-form { margin: 0; max-width: none; }
/* Multi-select Q3: square-ish check instead of the radio dot; Next button. */
.q-opt-multi::after { border-radius: 6px; }
.q-opt-multi.is-selected::after { content: "\2713"; color: #000; font-size: 13px; font-weight: 800; line-height: 20px; text-align: center; }
.q-next { width: 100%; margin-top: var(--space-5); }
@media (max-width: 640px) {
  .survey-body { padding: var(--space-5) var(--space-5) var(--space-6); }
  .survey-head { padding: var(--space-4) var(--space-5) 0; }
}
```

- [ ] **Step 4: Neutralize the old fixed-position quiz chrome**

The old `.quiz-progress` (fixed top bar) and `.quiz-back` (fixed top-left) are replaced by the in-box versions. Leave their CSS in place but they are no longer referenced by markup after Pass B. No action needed beyond confirming the new markup uses `survey-*` classes.

### Pass B: HTML

- [ ] **Step 5: Replace the fixed progress bar + back button markup**

Delete the two elements just inside `<body>` (`<div class="quiz-progress" ...>` and `<button ... class="quiz-back" ...>`). They move inside the box in the next step.

- [ ] **Step 6: Replace STATE 1 (`<section id="s-quiz">`) with the survey box**

Replace the entire `<section id="s-quiz"> ... </section>` block with:

```html
  <!-- ===================== SURVEY (contact + 4 questions) ==================== -->
  <section id="s-survey">
    <div class="wrap stage">
      <img class="stage-logo" src="/aoc/brand/aoc-white.svg" alt="Agent On Camera" width="76" height="40">
      <div class="survey-box">
        <div class="survey-topbar" aria-hidden="true"><div class="survey-topbar-fill" id="quizProgressFill"></div></div>
        <div class="survey-head">
          <button type="button" class="survey-back" id="quizBack" aria-label="Back">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <span class="survey-count" id="quizCount">1 / 4</span>
        </div>
        <div class="survey-body">
          <!-- Step 0: contact -->
          <div id="step-contact">
            <h1 class="contact-title">Book Your Demo</h1>
            <p class="contact-sub">Be first to book your demo. Just enter your name, email, and phone number to get started.</p>
            <form class="ld-form" id="contactForm" novalidate>
              <input type="text" name="fullName" id="cfName" placeholder="Full name" autocomplete="name" required>
              <input type="email" name="email" id="cfEmail" placeholder="Email address" autocomplete="email" inputmode="email" required>
              <input type="tel" name="phone" id="cfPhone" placeholder="Phone number" autocomplete="tel" inputmode="tel" required>
              <input class="ld-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
              <p class="ld-error" id="cfError" role="alert"></p>
              <button type="submit" class="ld-btn" id="cfSubmit">Continue</button>
            </form>
          </div>
          <!-- Steps 1 to 4: questions -->
          <div id="step-quiz">
            <p class="survey-sub">Before your demo, make sure you answer these 4 questions.</p>
            <div class="q-card" id="qCard"><!-- questions render here (JS) --></div>
          </div>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 7: Replace STATE 3 (texting) with the phone confirmation state**

Replace the entire `<section id="s-texting"> ... </section>` block with:

```html
  <!-- ===================== PHONE CONFIRMATION (call list) =================== -->
  <section id="s-phone">
    <div class="wrap stage">
      <img class="stage-logo" src="/aoc/brand/aoc-white.svg" alt="Agent On Camera" width="76" height="40">
      <span class="eyebrow">You're all set</span>
      <h2 class="h1">We'll be in touch shortly</h2>
      <p class="sub" style="margin-top:var(--space-4);">Our team will reach out to you shortly. Keep an eye on your phone.</p>
    </div>
  </section>
```

- [ ] **Step 8: Make the post-booking line variant-aware**

In `<section id="s-postbook">`, replace the line `<p class="sub">You'll be speaking with Claudio Rivera personally on this call.</p>` with:

```html
        <p class="sub" id="postbookWho">You'll be speaking with Claudio Rivera personally on this call.</p>
```

### Pass C: JavaScript

- [ ] **Step 9: Replace the state-machine `<script>` block**

Replace the entire funnel script (the block that starts `/* /aoc/livedemo — full-page qualification funnel (state machine) */` and ends before the reused-section scripts) with:

```html
<script>
/* ============================================================================
   /aoc/livedemo — enclosed survey funnel (state machine)
   States: contact -> quiz -> (phone | booking -> postbook)
   ============================================================================ */

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const submissionId = uuid();
const contact = { fullName: '', email: '', phone: '' };
let calendlyVariant = 'existing'; // 'team' | 'existing'

/* ---- State machine -------------------------------------------------------- */
function setState(name) {
  document.body.dataset.state = name;
  updateBackBtn();
  window.scrollTo(0, 0);
  if (name === 'booking') mountCalendly();
}

/* ---- Questions ------------------------------------------------------------ */
const QUESTIONS = [
  { key: 'q1', q: "How long have you had a real estate media business?",
    opts: ["Haven't started yet", "0-1 years", "1-3 years", "3+ years"] },
  { key: 'q2', q: "How much are you earning per month in your real estate media business currently?",
    opts: ["$0-$1,000", "$1,000-$3,000", "$3,000-$5,000", "$5,000-$10,000", "$10,000+"] },
  { key: 'q3', q: "What's most important for you to improve on to take your business from where it is now to where you want it to be? (select all that apply)",
    opts: ["Shooting", "Editing", "Sales", "Team Building"], multi: true },
  { key: 'q4', q: "If Agent on Camera is a fit and can truly support you in growing your real estate media business, are you willing to invest in yourself?",
    opts: ["Yes", "No"] },
];

// Routing — MUST mirror the server (src/app/api/aoc/livedemo/route.ts).
function earningsBucket(q2) {
  if (q2 === "$0-$1,000") return "LOW";
  if (q2 === "$1,000-$3,000" || q2 === "$3,000-$5,000") return "MID";
  return "HIGH"; // $5,000-$10,000 | $10,000+
}
function destinationFor(a) {
  if (a.q4 === "No") return "phone";
  var b = earningsBucket(a.q2);
  if (b === "LOW") return "phone";
  if (b === "MID") return "team";
  return "existing";
}

const answers = {}; // q1,q2,q4 = string; q3 = array
let qIdx = 0;
let locked = false;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function updateBackBtn() {
  const b = document.getElementById('quizBack');
  // Back is visible on every quiz question (Q1's Back returns to the contact step).
  if (b) b.style.visibility = (document.body.dataset.state === 'quiz') ? 'visible' : 'hidden';
}

function renderQuestion() {
  const card = document.getElementById('qCard');
  const item = QUESTIONS[qIdx];
  document.getElementById('quizCount').textContent = (qIdx + 1) + ' / ' + QUESTIONS.length;
  document.getElementById('quizProgressFill').style.width = (((qIdx + 1) / QUESTIONS.length) * 100) + '%';

  const sel = item.multi ? (answers[item.key] || []) : answers[item.key];
  const opts = item.opts.map(function (opt) {
    const isSel = item.multi ? (sel.indexOf(opt) !== -1) : (sel === opt);
    return '<button type="button" class="q-opt' + (item.multi ? ' q-opt-multi' : '') + (isSel ? ' is-selected' : '') +
             '" data-opt="' + opt.replace(/"/g, '&quot;') + '"><span>' + opt + '</span></button>';
  }).join('');
  const nextBtn = item.multi ? '<button type="button" class="ld-btn q-next" id="qNext">Next</button>' : '';
  card.innerHTML = '<p class="q-text">' + item.q + '</p><div class="q-opts">' + opts + '</div>' + nextBtn;

  card.querySelectorAll('.q-opt').forEach(function (btn) {
    btn.addEventListener('click', function () { item.multi ? toggleOption(btn) : selectOption(btn); });
  });
  if (item.multi) {
    const nb = document.getElementById('qNext');
    const upd = function () { nb.disabled = (answers[item.key] || []).length === 0; };
    upd();
    card._updNext = upd;
    nb.addEventListener('click', function () {
      if (locked || (answers[item.key] || []).length === 0) return;
      locked = true; advance();
    });
  }
  updateBackBtn();
}

function selectOption(btn) {
  if (locked) return;
  locked = true;
  answers[QUESTIONS[qIdx].key] = btn.getAttribute('data-opt');
  btn.classList.add('is-selected');
  setTimeout(advance, reduceMotion ? 0 : 260);
}

function toggleOption(btn) {
  const item = QUESTIONS[qIdx];
  const opt = btn.getAttribute('data-opt');
  const arr = answers[item.key] || (answers[item.key] = []);
  const i = arr.indexOf(opt);
  if (i === -1) { arr.push(opt); btn.classList.add('is-selected'); }
  else { arr.splice(i, 1); btn.classList.remove('is-selected'); }
  const card = document.getElementById('qCard');
  if (card._updNext) card._updNext();
}

function changeQuestion(newIdx, dir) {
  const card = document.getElementById('qCard');
  const outCls = dir === 'back' ? 'leaving-back' : 'leaving';
  const inCls = dir === 'back' ? 'entering-back' : 'entering';
  function swap() {
    qIdx = newIdx;
    renderQuestion();
    if (!reduceMotion) {
      card.classList.remove(outCls);
      card.classList.add(inCls);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { card.classList.remove(inCls); locked = false; });
      });
    } else { locked = false; }
  }
  if (reduceMotion) { swap(); return; }
  card.classList.add(outCls);
  setTimeout(swap, 280);
}

function advance() {
  if (qIdx >= QUESTIONS.length - 1) {
    if (reduceMotion) { finishQuiz(); return; }
    document.getElementById('qCard').classList.add('leaving');
    setTimeout(finishQuiz, 280);
    return;
  }
  changeQuestion(qIdx + 1, 'fwd');
}

function goBack() {
  if (locked) return;
  if (qIdx === 0) { setState('contact'); return; } // Q1 back -> contact step
  locked = true;
  changeQuestion(qIdx - 1, 'back');
}

function finishQuiz() {
  const dest = destinationFor(answers);
  submitLead(); // fire-and-forget POST #1
  if (dest === 'phone') {
    setState('phone');
  } else {
    calendlyVariant = dest; // 'team' | 'existing'
    setState('booking');
  }
  locked = false;
}

/* ---- Contact step --------------------------------------------------------- */
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function normalizePhone(v) { return (v || '').replace(/[^\d]/g, ''); }
function validPhone(v) { const d = normalizePhone(v); return d.length >= 10 && d.length <= 15; }

const contactForm = document.getElementById('contactForm');
contactForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const name = document.getElementById('cfName').value.trim();
  const email = document.getElementById('cfEmail').value.trim();
  const phone = document.getElementById('cfPhone').value.trim();
  const err = document.getElementById('cfError');
  err.textContent = '';
  if (!name) { err.textContent = 'Please enter your full name.'; return; }
  if (!validEmail(email)) { err.textContent = 'Please enter a valid email address.'; return; }
  if (!validPhone(phone)) { err.textContent = 'Please enter a valid phone number.'; return; }
  contact.fullName = name; contact.email = email; contact.phone = phone;
  qIdx = 0;
  setState('quiz');
  renderQuestion();
});

/* ---- Backend POST --------------------------------------------------------- */
async function postFunnel(payload) {
  const res = await fetch('/api/aoc/livedemo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = 'Something went wrong. Please try again.';
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

function submitLead() {
  const website = contactForm.querySelector('[name="website"]').value;
  postFunnel({
    type: 'submit',
    submissionId: submissionId,
    fullName: contact.fullName, email: contact.email, phone: contact.phone,
    q1: answers.q1, q2: answers.q2, q3: answers.q3 || [], q4: answers.q4,
    website: website,
  }).catch(function (e) { console.warn('[livedemo] submit POST failed:', e && e.message); });
}

/* ---- Calendly (mounted on demand, prefilled) ------------------------------ */
let calendlyMounted = false;
function calendlyUrl() {
  const base = calendlyVariant === 'team' ? CALENDLY_TEAM_URL : CALENDLY_EXISTING_URL;
  if (!base) return '';
  return base + '?name=' + encodeURIComponent(contact.fullName) + '&email=' + encodeURIComponent(contact.email);
}
function mountCalendly() {
  if (calendlyMounted) return;
  calendlyMounted = true;
  const mount = document.getElementById('calendlyMount');
  const url = calendlyUrl();
  if (url) {
    const widget = document.createElement('div');
    widget.className = 'calendly-inline-widget';
    widget.setAttribute('data-url', url);
    mount.appendChild(widget);
    const s = document.createElement('script');
    s.src = 'https://assets.calendly.com/assets/external/widget.js';
    s.async = true;
    document.body.appendChild(s);
  } else {
    mount.innerHTML = '<div class="booking-placeholder">Booking calendar coming. The Calendly link will be added here.</div>';
  }
}

window.addEventListener('message', function (e) {
  if (e && e.data && e.data.event === 'calendly.event_scheduled') { onBooked(); }
});
document.getElementById('bookedFallback').addEventListener('click', onBooked);

let bookedSubmitted = false;
function onBooked() {
  const who = calendlyVariant === 'team'
    ? "You'll be speaking with a member of our team on this call."
    : "You'll be speaking with Claudio Rivera personally on this call.";
  const el = document.getElementById('postbookWho');
  if (el) el.textContent = who;
  setState('postbook');
  if (bookedSubmitted) return;
  bookedSubmitted = true;
  postFunnel({ type: 'booked_confirmed', submissionId: submissionId })
    .catch(function (e) { console.warn('[livedemo] booked_confirmed POST failed:', e && e.message); });
}

/* ---- Reschedule link (shown only if the constant is set) ------------------ */
(function () {
  const r = document.getElementById('rescheduleLink');
  if (CALENDLY_RESCHEDULE_URL) { r.href = CALENDLY_RESCHEDULE_URL; r.style.display = 'inline-flex'; }
})();

/* ---- init ----------------------------------------------------------------- */
document.getElementById('quizBack').addEventListener('click', goBack);
setState('contact');
</script>
```

### Pass D: verification

- [ ] **Step 10: Verify the full flow in the browser**

With `npm run dev` running, open `http://localhost:3000/aoc/livedemo` and confirm:
1. The survey opens on the **contact step** inside a rounded elevated box on the dark background. No progress bar or back button visible yet.
2. Submitting empty / bad email / bad phone shows the inline error. Valid entry advances to Q1; the **progress bar and back button now appear inside the box** next to "1 / 4".
3. Q1, Q2 auto-advance on tap. **Q3 is multi-select** with a "(select all that apply)" prompt and a **Next** button that is disabled until at least one is chosen. Q4 (Yes/No) auto-advances.
4. Back from Q1 returns to the contact step with entries preserved in the fields is not required, but it must not error.
5. Routing: `$0-$1,000`+Yes and any+No show the **phone confirmation**; `$1,000-$3,000`/`$3,000-$5,000`+Yes show the **team Calendly** (URL contains `aoc-live-demo`, name/email prefilled); `$5,000-$10,000`/`$10,000+`+Yes show the **existing Calendly** (`/demo`).
6. The Network tab shows one POST to `/api/aoc/livedemo` with `type:"submit"` firing at Q4, returning the matching `destination`.
7. Post-booking copy reads "a member of our team" for the team path and "Claudio Rivera" for the existing path.
8. No em dashes anywhere on screen.

- [ ] **Step 11: Commit**

```bash
git add public/aoc/livedemo.html
git commit -m "aoc/livedemo: enclosed survey box, contact step, multi-select Q3, earnings routing"
```

---

## Self-Review notes (completed by author)

- **Spec coverage:** box + in-box bar/back (Task 4 Pass A/B); contact step name/email/phone (Task 4 Pass B/C); multi-select Q3 + Next (Task 4); earnings routing to 3 destinations (Task 2 + Task 4); phone confirmation copy (Task 4 Step 7); variant post-booking copy (Task 4 Step 8/9); Supabase columns (Task 1); two-POST tracking (Task 2); Sheets append/update + two tabs (Task 2 + Task 3); env vars (Task 2 Step 4). All covered.
- **Type consistency:** `destinationFor`/`routeDestination` return the same `phone|team|existing`; `earningsBucket` identical on both sides; `submissionId` shared across both POSTs; sheet column order in Task 3 matches the append arg order in Task 2.
- **Copy:** all new copy checked for em dashes (none).
```
