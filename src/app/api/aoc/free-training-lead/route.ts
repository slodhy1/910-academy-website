import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_PHONE = 40;

// Captures the /aoc/free-training "Download the Assets" gate: first name / email /
// phone plus the required marketing-consent checkbox. Stored in aoc_free_training_leads
// (service-role insert, RLS-protected). The front-end fires this and opens the Dropbox
// link regardless, so a save hiccup never blocks the download.
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

  const firstName = String(b.first_name ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const consent = b.consent === true;

  if (!firstName || firstName.length > MAX_NAME) {
    return NextResponse.json({ error: "First name required" }, { status: 400 });
  }
  if (!phone || phone.length > MAX_PHONE) {
    return NextResponse.json({ error: "Phone required" }, { status: 400 });
  }
  if (!email || email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json({ error: "Consent required" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("aoc_free_training_leads")
    .insert({ first_name: firstName, email, phone, consent: true })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[free-training-lead] insert failed:", error);
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
