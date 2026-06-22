import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_PHONE = 40;

// Saves the AOC Live checkout-modal details (name/email/phone) before the buyer is
// forwarded to Stripe. The Stripe webhook (process-checkout.ts) later flips
// purchased_at and fires the team notify + buyer confirmation once payment lands.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const fullName = String(b.full_name ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();

  if (!fullName || fullName.length > MAX_NAME) {
    return NextResponse.json({ error: "Full name required" }, { status: 400 });
  }
  if (!phone || phone.length > MAX_PHONE) {
    return NextResponse.json({ error: "Phone required" }, { status: 400 });
  }
  if (!email || email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("aoc_live_intake")
    .insert({ full_name: fullName, phone, email })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[aoc-live-intake] insert failed:", error);
    return NextResponse.json({ error: "Could not save intake" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
