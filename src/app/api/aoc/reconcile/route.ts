import { NextResponse } from "next/server";
import { reconcileKit } from "@/lib/aoc/reconcile";

export const runtime = "nodejs";
// Allow a little headroom for backoff sleeps across a small batch.
export const maxDuration = 60;

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
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await reconcileKit({ limit: 40 });
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[aoc/reconcile] run failed:", err);
    return NextResponse.json({ ok: false, error: "Reconcile failed" }, { status: 500 });
  }
}
