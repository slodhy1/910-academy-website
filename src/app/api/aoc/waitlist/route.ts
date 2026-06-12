import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Same email shape the rest of the site validates against (see the-6ix-intake).
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

const KIT_BASE = "https://api.kit.com/v4";

// Log a failed Kit response, calling out 429 (rate limit: 120 req / rolling 60s)
// so it's obvious in the logs that the row should be reconciled later, not lost.
async function logKitFailure(label: string, res: Response): Promise<void> {
  const body = await res.text().catch(() => "");
  if (res.status === 429) {
    console.error(`[aoc/waitlist] Kit ${label} rate-limited (429) — leaving kit_synced=false for reconciliation. ${body}`);
  } else {
    console.error(`[aoc/waitlist] Kit ${label} failed: ${res.status} ${res.statusText} ${body}`);
  }
}

/**
 * Best-effort sync to Kit (ConvertKit). Creates/upserts the subscriber, then
 * applies the waitlist tag (which triggers the welcome automation). Returns the
 * Kit subscriber id on full success, or null on ANY failure — the caller treats
 * null as "leave kit_synced = false and move on". Never throws.
 */
async function syncToKit(firstName: string, email: string): Promise<number | null> {
  const apiKey = process.env.KIT_API_KEY;
  const tagId = process.env.KIT_TAG_ID_AOC_WAITLIST;
  if (!apiKey || !tagId) {
    console.warn("[aoc/waitlist] Kit env missing (KIT_API_KEY / KIT_TAG_ID_AOC_WAITLIST); skipping Kit sync.");
    return null;
  }

  try {
    // 1. Create or upsert the subscriber. Kit returns the existing subscriber
    //    (not an error) when the email already exists.
    const subRes = await fetch(`${KIT_BASE}/subscribers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Kit-Api-Key": apiKey },
      body: JSON.stringify({ first_name: firstName, email_address: email }),
    });
    if (!subRes.ok) {
      await logKitFailure("subscriber upsert", subRes);
      return null;
    }
    const subJson = (await subRes.json().catch(() => null)) as
      | { subscriber?: { id?: number } }
      | null;
    const subscriberId = subJson?.subscriber?.id;
    if (typeof subscriberId !== "number") {
      console.error("[aoc/waitlist] Kit subscriber response missing id.");
      return null;
    }

    // 2. Apply the waitlist tag -> triggers the welcome automation.
    const tagRes = await fetch(`${KIT_BASE}/tags/${tagId}/subscribers/${subscriberId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Kit-Api-Key": apiKey },
      body: JSON.stringify({}),
    });
    if (!tagRes.ok) {
      await logKitFailure("tag apply", tagRes);
      return null;
    }

    return subscriberId;
  } catch (err) {
    console.error("[aoc/waitlist] Kit sync threw:", err);
    return null;
  }
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { firstName, email, utm } = parsed.data;
  // `source` is always populated; utm_source holds the raw param (may be null).
  const utmSource = utm.source ?? null;
  const source = utmSource || "aoc-waitlist";

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("aoc_waitlist")
    .upsert(
      {
        first_name: firstName,
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

  // Kit is best-effort. A Kit failure (429, network, bad config, anything) must
  // never fail the user — the row above is what matters. kit_synced stays false
  // and can be backfilled later.
  const kitSubscriberId = await syncToKit(firstName, email);
  if (kitSubscriberId !== null) {
    const { error: updErr } = await sb
      .from("aoc_waitlist")
      .update({ kit_subscriber_id: kitSubscriberId, kit_synced: true })
      .eq("id", data.id);
    if (updErr) {
      console.error("[aoc/waitlist] kit_synced update failed:", updErr);
    }
  }

  return NextResponse.json({ ok: true });
}
