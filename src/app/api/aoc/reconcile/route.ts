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
 * Vercel Cron: drains the AOC waitlist -> Kit backlog (rows with
 * kit_synced = false). Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * automatically when CRON_SECRET is set, so we gate on it.
 *
 * Batch is kept small (40) so the function stays within the serverless timeout;
 * successive runs drain any backlog.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  // Fail closed if the secret isn't configured; constant-time compare otherwise.
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Larger batch + internal deadline (stays under maxDuration); successive
    // runs drain any backlog at Kit's max safe rate.
    const summary = await reconcileKit({ limit: 200, deadlineMs: 50_000 });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[aoc/reconcile] run failed:", err);
    return NextResponse.json({ ok: false, error: "Reconcile failed" }, { status: 500 });
  }
}
