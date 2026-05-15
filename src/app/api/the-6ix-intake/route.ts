import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendThe6ixIntakeNotify, type TicketType } from "@/lib/email/the-6ix-intake-notify";

export const runtime = "nodejs";

const TICKET_TYPES = ["shooting", "editing", "both"] as const;

const MAX_NAME = 200;
const MAX_COMPANY = 200;
const MAX_EMAIL = 320;
const MAX_PHONE = 40;

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

  const ticketType = String(b.ticket_type ?? "").trim();
  const companyName = String(b.company_name ?? "").trim();
  const fullName = String(b.full_name ?? "").trim();
  const phone = String(b.phone ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();

  if (!TICKET_TYPES.includes(ticketType as TicketType)) {
    return NextResponse.json({ error: "Invalid ticket type" }, { status: 400 });
  }
  if (!companyName || companyName.length > MAX_COMPANY) {
    return NextResponse.json({ error: "Company name required" }, { status: 400 });
  }
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
    .from("the_6ix_intake")
    .insert({
      ticket_type: ticketType,
      company_name: companyName,
      full_name: fullName,
      phone,
      email,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[the-6ix-intake] insert failed:", error);
    return NextResponse.json({ error: "Could not save intake" }, { status: 500 });
  }

  // Email notify in the background; we don't gate the Stripe redirect on email success.
  const notifyResult = await sendThe6ixIntakeNotify({
    ticketType: ticketType as TicketType,
    companyName,
    fullName,
    phone,
    email,
  });
  if (!notifyResult.success) {
    console.error("[the-6ix-intake] notify failed:", notifyResult.error);
  }

  return NextResponse.json({ ok: true, id: data.id });
}
