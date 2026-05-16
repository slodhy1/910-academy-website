import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendClaudioApplicationNotify } from "@/lib/email/claudio-application-notify";
import { sendClaudioApplicationConfirm } from "@/lib/email/claudio-application-confirm";

export const runtime = "nodejs";

const HELP_TYPES = ["1:1 strategy", "private training", "custom build"] as const;
const BUDGET_RANGES = ["under 1k", "1-5k", "5-10k", "10k+"] as const;

type HelpType = typeof HELP_TYPES[number];
type BudgetRange = typeof BUDGET_RANGES[number];

const MAX_TEXT = 5000;
const MAX_NAME = 200;
const MAX_EMAIL = 320;
const MAX_SHORT = 500;

const ALLOWED_HOSTS = new Set([
  "www.910academy.com",
  "910academy.com",
  "localhost:3000",
  "localhost:3001",
]);

function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const source = origin || referer;
  if (!source) return false;
  let host: string;
  try {
    host = new URL(source).host;
  } catch {
    return false;
  }
  if (ALLOWED_HOSTS.has(host)) return true;
  // Vercel preview deployments
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    console.warn("[claudio-application] rejected: bad origin", {
      origin: req.headers.get("origin"),
      referer: req.headers.get("referer"),
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

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

  // Honeypot: real users can't see/fill the `website` field. Bots will.
  if (String(b.website ?? "").trim() !== "") {
    console.warn("[claudio-application] rejected: honeypot tripped", {
      website: String(b.website ?? "").slice(0, 80),
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const businessName = String(b.business_name ?? "").trim() || null;
  const portfolioUrl = String(b.portfolio_url ?? "").trim() || null;
  const helpType = String(b.help_type ?? "").trim();
  const budgetRange = String(b.budget_range ?? "").trim();
  const goal = String(b.goal ?? "").trim();
  const additionalNotes = String(b.additional_notes ?? "").trim() || null;

  if (!name || name.length > MAX_NAME) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  if (!email || email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (businessName && businessName.length > MAX_SHORT) {
    return NextResponse.json({ error: "Business name too long" }, { status: 400 });
  }
  if (portfolioUrl && portfolioUrl.length > MAX_SHORT) {
    return NextResponse.json({ error: "Portfolio URL too long" }, { status: 400 });
  }
  if (!HELP_TYPES.includes(helpType as HelpType)) {
    return NextResponse.json({ error: "Invalid help type" }, { status: 400 });
  }
  if (!BUDGET_RANGES.includes(budgetRange as BudgetRange)) {
    return NextResponse.json({ error: "Invalid budget range" }, { status: 400 });
  }
  if (!goal || goal.length > MAX_TEXT) {
    return NextResponse.json({ error: "Goal required" }, { status: 400 });
  }
  if (additionalNotes && additionalNotes.length > MAX_TEXT) {
    return NextResponse.json({ error: "Notes too long" }, { status: 400 });
  }

  const sb = createAdminClient();
  const { data, error } = await sb
    .from("claudio_applications")
    .insert({
      name,
      email,
      business_name: businessName,
      portfolio_url: portfolioUrl,
      help_type: helpType,
      budget_range: budgetRange,
      goal,
      additional_notes: additionalNotes,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[claudio-application] insert failed:", error);
    return NextResponse.json({ error: "Could not save application" }, { status: 500 });
  }

  const [notifyResult, confirmResult] = await Promise.all([
    sendClaudioApplicationNotify({
      name,
      email,
      businessName,
      portfolioUrl,
      helpType,
      budgetRange,
      goal,
      additionalNotes,
    }),
    sendClaudioApplicationConfirm({ to: email, name }),
  ]);
  if (!notifyResult.success) {
    console.error("[claudio-application] notify failed:", notifyResult.error);
  }
  if (!confirmResult.success) {
    console.error("[claudio-application] confirm failed:", confirmResult.error);
  }

  return NextResponse.json({ ok: true, id: data.id });
}
