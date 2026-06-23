import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { reconcileKit } from "@/lib/aoc/reconcile";

export const runtime = "nodejs";
// Allow a little headroom for backoff sleeps across a small batch.
export const maxDuration = 60;

// Constant-time compare so the secret can't be guessed via response timing.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Vercel Cron: drains the /three-levels free-event registration -> Kit backlog
 * (aoc_event_registrations rows with kit_synced = false), applying the free-event
 * tag (KIT_TAG_ID_AOC_FREE_LIVE) so the reminder sequence targets registrants
 * separately from the waitlist. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * automatically when CRON_SECRET is set, so we gate on it.
 *
 * Mirrors GET /api/aoc/reconcile; reuses the same reconcileKit() drain logic.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  // Fail closed if the secret isn't configured; constant-time compare otherwise.
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await reconcileKit({
      table: "aoc_event_registrations",
      tagId: process.env.KIT_TAG_ID_AOC_FREE_LIVE,
      limit: 200,
      deadlineMs: 50_000,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[aoc-event/reconcile] run failed:", err);
    return NextResponse.json({ ok: false, error: "Reconcile failed" }, { status: 500 });
  }
}
