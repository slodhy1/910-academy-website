import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLivedemoSheet } from "@/lib/aoc/livedemo-sheets";

export const runtime = "nodejs";

// Calendly signs with HMAC-SHA256 over `${t}.${rawBody}`; the header value is
// `t=<unix_ts>,v1=<hex_signature>` (same shape as Stripe's). We verify against the
// webhook signing key before trusting anything in the payload.
function verifyCalendlySignature(rawBody: string, header: string | null, key: string): boolean {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const kv of header.split(",")) {
    const idx = kv.indexOf("=");
    if (idx > 0) parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
  }
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;

  const expected = crypto.createHmac("sha256", key).update(`${t}.${rawBody}`).digest("hex");
  let a: Buffer, b: Buffer;
  try {
    a = Buffer.from(expected, "hex");
    b = Buffer.from(v1, "hex");
  } catch {
    return false;
  }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  // Replay guard: reject signatures older than 5 minutes.
  const ageSec = Math.abs(Date.now() / 1000 - Number(t));
  return Number.isFinite(ageSec) && ageSec < 300;
}

export async function POST(req: Request) {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });

  const raw = await req.text();
  if (!verifyCalendlySignature(raw, req.headers.get("calendly-webhook-signature"), key)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let evt: { event?: string; payload?: Record<string, unknown> };
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  if (evt?.event !== "invitee.created") {
    return NextResponse.json({ ok: true, ignored: evt?.event ?? null });
  }

  const p = (evt.payload ?? {}) as Record<string, unknown>;
  const scheduled = (p.scheduled_event ?? {}) as Record<string, unknown>;
  const email = String(p.email ?? "").trim().toLowerCase();
  const name = String(p.name ?? "").trim();
  const source = String(scheduled.event_type ?? scheduled.uri ?? "").trim();
  const bookedAt = new Date().toISOString();

  const sb = createAdminClient();

  // Attribute the booking to a lead (and thus a variant) by email. Prefer the most
  // recent Calendly-routed lead (calendly not null) with that email.
  let matchedId: string | null = null;
  if (email) {
    const { data } = await sb
      .from("aoc_livedemo_submissions")
      .select("submission_id")
      .ilike("email", email)
      .not("calendly", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) matchedId = data[0].submission_id as string;
  }

  if (matchedId) {
    const { error } = await sb
      .from("aoc_livedemo_submissions")
      .update({ status: "Booked", booked_at: bookedAt })
      .eq("submission_id", matchedId);
    if (error) console.error("[calendly-webhook] update failed:", error);
    // Mirror: flip the sales booked-tab status (existing action) + fill the Funnel row.
    await syncLivedemoSheet({ action: "update", submissionId: matchedId, status: "Booked", bookedAt });
    await syncLivedemoSheet({ action: "funnel", submissionId: matchedId, bookedAt, status: "Booked" });
    return NextResponse.json({ ok: true, matched: true });
  }

  // Unmatched: keep it visible (never dropped); excluded from per-variant booking rate.
  await syncLivedemoSheet({ action: "funnel_unmatched", email, name, bookedAt, source });
  return NextResponse.json({ ok: true, matched: false });
}
