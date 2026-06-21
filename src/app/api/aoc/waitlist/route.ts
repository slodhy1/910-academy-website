import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Same email shape the rest of the site validates against (see the-6ix-intake).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const utmField = z.string().trim().max(200).optional();

const BodySchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(200),
  lastName: z.string().trim().min(1, "Last name is required").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Valid email required")
    .max(320, "Valid email required")
    .refine((v) => EMAIL_RE.test(v), { message: "Valid email required" }),
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
// claudio-application route). Blocks naive cross-origin/bot POSTs.
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

// Cloudflare Turnstile (bot defense). Skips when TURNSTILE_SECRET_KEY is unset
// (honeypot + origin still apply). Fails OPEN on a Turnstile outage so a real
// signup spike is never lost to a third-party failure.
async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    const data = (await res.json().catch(() => ({ success: false }))) as { success?: boolean };
    return data.success === true;
  } catch {
    return true; // Turnstile unreachable -> don't block real users
  }
}

export async function POST(req: Request) {
  // Reject naive cross-origin/bot POSTs. Return a fake 200 so bots don't learn.
  if (!isAllowedOrigin(req)) {
    console.warn("[aoc/waitlist] rejected: bad origin");
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
    console.warn("[aoc/waitlist] rejected: honeypot tripped");
    return NextResponse.json({ ok: true });
  }

  // Cloudflare Turnstile (no-op until TURNSTILE_SECRET_KEY is set).
  const turnstileToken = String((raw as Record<string, unknown>)?.turnstileToken ?? "");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    console.warn("[aoc/waitlist] rejected: turnstile failed");
    return NextResponse.json({ ok: true });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { firstName, lastName, email, utm } = parsed.data;
  // first_name + last_name are stored separately; full_name = "First Last" is kept for
  // continuity. Only first_name is sent to Kit (see reconcile) — last_name is internal.
  const fullName = `${firstName} ${lastName}`.trim();
  // `source` is always populated; utm_source holds the raw param (may be null).
  const utmSource = utm.source ?? null;
  const source = utmSource || "aoc-waitlist";

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("aoc_waitlist")
    .upsert(
      {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        email,
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
    console.error("[aoc/waitlist] upsert failed:", error);
    return NextResponse.json({ error: "Could not join the waitlist. Please try again." }, { status: 500 });
  }

  // Kit sync is intentionally NOT done here — the request never touches Kit's API,
  // so joining is instant. The durable row (kit_synced=false) is drained to Kit by
  // the Vercel Cron (/api/aoc/reconcile, every 2 min). The welcome automation fires
  // within ~2 min of signup; no lead is ever lost.
  return NextResponse.json({ ok: true });
}
