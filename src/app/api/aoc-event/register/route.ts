import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLevelsConfirm } from "@/lib/email/levels-confirm";

export const runtime = "nodejs";

// Same email shape the rest of the site validates against (see aoc/waitlist).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const utmField = z.string().trim().max(200).optional();

const BodySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Valid email required")
    .max(320, "Valid email required")
    .refine((v) => EMAIL_RE.test(v), { message: "Valid email required" }),
  // Phone is prominent on the form but optional — it must never cost a registration.
  // Stored for the closers / OpenPhone; never sent to Kit.
  phone: z.string().trim().max(40).optional().default(""),
  utm: z
    .object({
      source: utmField,
      medium: utmField,
      campaign: utmField,
      content: utmField,
      term: utmField,
    })
    .partial()
    .optional()
    .default({}),
});

// Only accept state-changing requests from our own origins (same pattern as the
// aoc/waitlist route). Blocks naive cross-origin/bot POSTs.
const ALLOWED_HOSTS = new Set([
  "www.910academy.com",
  "910academy.com",
  "localhost:3000",
  "localhost:3001",
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
  if (host.endsWith(".vercel.app")) return true; // preview deployments
  return false;
}

// NOTE: no Cloudflare Turnstile here. The /three-levels page intentionally ships
// without a Turnstile widget (clean hero), so the form sends no token. Because
// TURNSTILE_SECRET_KEY is set globally for the waitlist, verifying a token here
// would ALWAYS fail and silently reject every registration. Bot defense for this
// endpoint is the origin allowlist + honeypot below.

export async function POST(req: Request) {
  // Reject naive cross-origin/bot POSTs. Return a fake 200 so bots don't learn.
  if (!isAllowedOrigin(req)) {
    console.warn("[aoc-event/register] rejected: bad origin");
    return NextResponse.json({ ok: true });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot: the hidden `website` field is invisible to humans; bots fill it.
  if (raw && typeof raw === "object" && String((raw as Record<string, unknown>).website ?? "").trim() !== "") {
    console.warn("[aoc-event/register] rejected: honeypot tripped");
    return NextResponse.json({ ok: true });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { firstName, email, phone, utm } = parsed.data;
  // `source` is always populated; utm_source holds the raw param (may be null).
  const utmSource = utm.source ?? null;
  const source = utmSource || "free-event";

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("aoc_event_registrations")
    .upsert(
      {
        first_name: firstName,
        email,
        phone: phone || null,
        source,
        utm_source: utmSource,
        utm_medium: utm.medium ?? null,
        utm_campaign: utm.campaign ?? null,
        utm_content: utm.content ?? null,
        utm_term: utm.term ?? null,
      },
      { onConflict: "email" }
    )
    .select("id")
    .single();

  if (error || !data) {
    // The Supabase row is the durable record — if this fails we have nothing.
    console.error("[aoc-event/register] upsert failed:", error);
    return NextResponse.json({ error: "Could not register. Please try again." }, { status: 500 });
  }

  // Confirmation email goes out AFTER the response (no added latency to the submit).
  // Best-effort: a Resend failure never affects the registration — the durable row is
  // saved and Kit sync runs via the cron. Kit sync itself is NOT done here (instant signup).
  after(async () => {
    const emailResult = await sendLevelsConfirm({ to: email, firstName });
    if (!emailResult.success) {
      console.error("[aoc-event/register] confirmation email failed:", emailResult.error);
    }
  });

  // The durable row (kit_synced=false) is drained to Kit by the Vercel Cron
  // (/api/aoc-event/reconcile, every 2 min) with KIT_TAG_ID_AOC_FREE_LIVE.
  return NextResponse.json({ ok: true });
}
