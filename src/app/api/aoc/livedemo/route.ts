import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAocLivedemoNotify } from "@/lib/email/aoc-livedemo-notify";

export const runtime = "nodejs";

// The four quiz answers — these literals MUST stay in sync with the options in
// public/aoc/livedemo.html (they are the same strings the client renders).
const Q1 = z.enum(["Haven't started yet", "0-1 years", "1-3 years", "3+ years"]);
const Q2 = z.enum(["$0-$1,000", "$1,000-$3,000", "$3,000-$5,000", "$5,000-$10,000", "$10,000+"]);
const Q3 = z.enum(["Shooting", "Editing", "Sales", "Team Building", "All of the above"]);
const Q4 = z.enum(["Yes", "No"]);

const answers = { q1: Q1, q2: Q2, q3: Q3, q4: Q4 };

// Two completion shapes: a qualified lead that booked in Calendly, or an
// unqualified/not-yet lead captured for texting (name + phone required).
const BodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("booked"), ...answers }),
  z.object({
    type: z.literal("texting"),
    ...answers,
    fullName: z.string().trim().min(1, "Full name is required").max(200),
    phone: z
      .string()
      .trim()
      .min(1, "Phone number is required")
      .max(40)
      .refine(
        (v) => {
          const d = v.replace(/\D/g, "");
          return d.length >= 10 && d.length <= 15;
        },
        { message: "Valid phone number required" }
      ),
  }),
]);

// STRICT qualification — must match the client predicate in livedemo.html exactly.
const HIGH_EARNINGS = new Set(["$5,000-$10,000", "$10,000+"]);

// Only accept state-changing requests from our own origins (same pattern as the
// aoc/waitlist + claudio-application routes). Blocks naive cross-origin/bot POSTs.
const ALLOWED_HOSTS = new Set([
  "www.910academy.com",
  "910academy.com",
  "localhost:3000",
  "localhost:3001",
  // loopback for local dev (Next dev + HSTS on :3000 forces 127.0.0.1); reachable only locally
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
  if (host.endsWith(".vercel.app")) return true; // preview deployments
  return false;
}

export async function POST(req: Request) {
  // Reject naive cross-origin/bot POSTs. Return a fake 200 so bots don't learn.
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

  // Honeypot: the hidden `website` field is invisible to humans; bots fill it.
  if (raw && typeof raw === "object" && String((raw as Record<string, unknown>).website ?? "").trim() !== "") {
    console.warn("[aoc/livedemo] rejected: honeypot tripped");
    return NextResponse.json({ ok: true });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const d = parsed.data;
  // Server is the source of truth for qualification (never trust a client flag).
  const qualified = HIGH_EARNINGS.has(d.q2) && d.q4 === "Yes";
  const fullName = d.type === "texting" ? d.fullName : null;
  const phone = d.type === "texting" ? d.phone : null;

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("aoc_livedemo_submissions")
    .insert({
      q1_experience: d.q1,
      q2_earnings: d.q2,
      q3_focus: d.q3,
      q4_invest: d.q4,
      qualified,
      outcome: d.type,
      full_name: fullName,
      phone,
    })
    .select("id")
    .single();

  if (error || !data) {
    // The Supabase row is the durable record — if this fails we have nothing.
    console.error("[aoc/livedemo] insert failed:", error);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }

  // Email academy@studio910pb.com on every completion. Log-but-don't-block: an
  // email failure must never turn a saved submission into an error for the user.
  const notify = await sendAocLivedemoNotify({
    type: d.type,
    q1: d.q1,
    q2: d.q2,
    q3: d.q3,
    q4: d.q4,
    qualified,
    fullName,
    phone,
  });
  if (!notify.success) {
    console.error("[aoc/livedemo] notify failed:", notify.error);
  }

  return NextResponse.json({ ok: true, id: data.id });
}
