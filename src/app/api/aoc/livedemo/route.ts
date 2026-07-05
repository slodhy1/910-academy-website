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
  .refine(
    (v) => {
      const d = v.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 15;
    },
    { message: "Valid phone number required" }
  );

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

// Only accept state-changing requests from our own origins (same pattern as the
// aoc/waitlist + claudio-application routes). Blocks naive cross-origin/bot POSTs.
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

  const { error } = await sb.from("aoc_livedemo_submissions").upsert(
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
    // The Supabase row is the durable record — if this fails we have nothing.
    console.error("[aoc/livedemo] upsert failed:", error);
    return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  }

  // Email + Sheets are best-effort; a failure never blocks the saved lead.
  const notify = await sendAocLivedemoNotify({
    q1: d.q1,
    q2: d.q2,
    q3: q3Joined,
    q4: d.q4,
    fullName: d.fullName,
    email: d.email,
    phone: d.phone,
    bucket,
    destination,
    outcome,
  });
  if (!notify.success) console.error("[aoc/livedemo] notify failed:", notify.error);

  await syncLivedemoSheet({
    action: "append",
    submissionId: d.submissionId,
    fullName: d.fullName,
    email: d.email,
    phone: d.phone,
    q1: d.q1,
    q2: d.q2,
    q3: q3Joined,
    q4: d.q4,
    bucket,
    destination,
    outcome,
    status: outcome === "booked" ? "Routed" : "",
  });

  return NextResponse.json({ ok: true, destination });
}
