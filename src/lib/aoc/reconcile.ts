import { createAdminClient } from "@/lib/supabase/admin";

/**
 * AOC -> Kit reconciliation (shared by the waitlist and the free-event registration).
 *
 * Sweeps rows in `table` that the signup route couldn't sync to Kit
 * (kit_synced = false) and finishes the job: create/upsert the subscriber,
 * apply `tagId`, then flip kit_synced = true. Each Kit call uses exponential
 * backoff and honors a 429 Retry-After. A row that still fails is left for the
 * next run.
 *
 * Both tables share the same drainable shape (id, first_name, email, kit_subscriber_id,
 * kit_synced). Defaults target the waitlist so existing callers are unchanged:
 *   - GET /api/aoc/reconcile        -> aoc_waitlist            + KIT_TAG_ID_AOC_WAITLIST
 *   - GET /api/aoc-event/reconcile  -> aoc_event_registrations + KIT_TAG_ID_AOC_FREE_LIVE
 * KIT_API_KEY is shared.
 */

const KIT_BASE = "https://api.kit.com/v4";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class KitError extends Error {
  rateLimited: boolean;
  constructor(message: string, rateLimited = false) {
    super(message);
    this.rateLimited = rateLimited;
  }
}

/**
 * Retry transient errors with short exponential backoff. A 429 is NOT retried
 * here — it bubbles up so the run can stop cleanly and let the next (frequent)
 * cron run continue within Kit's rolling rate budget, instead of sleeping ~60s
 * mid-run and risking the function timeout.
 */
async function withBackoff<T>(fn: () => Promise<T>, tries = 3, base = 500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof KitError && err.rateLimited) throw err;
      if (i === tries - 1) break;
      await sleep(base * Math.pow(2, i));
    }
  }
  throw lastErr;
}

async function kitPost(apiKey: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${KIT_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Kit-Api-Key": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 429) throw new KitError(`Kit ${path} -> 429`, true);
    // status only — the Kit error body can echo the email (no PII in logs)
    throw new KitError(`Kit ${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json().catch(() => ({}));
}

export interface ReconcileResult {
  processed: number;
  synced: number;
  failed: number;
  rateLimited: boolean;
}

/**
 * Drain up to `limit` unsynced rows, oldest first, stopping early if `deadlineMs`
 * is reached (stay under the function's maxDuration) or if Kit rate-limits us.
 * Whatever isn't reached stays kit_synced=false for the next run — nothing lost.
 */
export async function reconcileKit(
  {
    table = "aoc_waitlist",
    tagId = process.env.KIT_TAG_ID_AOC_WAITLIST,
    limit = 200,
    deadlineMs = 50_000,
  }: { table?: string; tagId?: string; limit?: number; deadlineMs?: number } = {}
): Promise<ReconcileResult> {
  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey || !tagId) {
    throw new Error("Kit env missing (KIT_API_KEY / tag id)");
  }

  const sb = createAdminClient();
  const { data: rows, error } = await sb
    .from(table)
    .select("id, first_name, email")
    .eq("kit_synced", false)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Supabase select failed: ${error.message}`);

  const result: ReconcileResult = { processed: 0, synced: 0, failed: 0, rateLimited: false };
  const startedAt = Date.now();

  for (const row of rows ?? []) {
    if (Date.now() - startedAt >= deadlineMs) break; // stay under maxDuration
    result.processed++;
    try {
      // create / upsert subscriber (Kit returns the existing one on duplicate email)
      const sub = (await withBackoff(() =>
        kitPost(apiKey, "/subscribers", { first_name: row.first_name, email_address: row.email })
      )) as { subscriber?: { id?: number } };
      const subscriberId = sub?.subscriber?.id;
      if (typeof subscriberId !== "number") throw new Error("Kit subscriber response missing id");

      // apply the waitlist tag -> triggers the welcome automation
      await withBackoff(() => kitPost(apiKey, `/tags/${tagId}/subscribers/${subscriberId}`, {}));

      const { error: updErr } = await sb
        .from(table)
        .update({ kit_subscriber_id: subscriberId, kit_synced: true })
        .eq("id", row.id);
      if (updErr) throw new Error(`Supabase update failed: ${updErr.message}`);

      result.synced++;
    } catch (err) {
      result.failed++;
      // Kit rate budget exhausted: stop this run; the next run continues. No leads lost.
      if (err instanceof KitError && err.rateLimited) {
        result.rateLimited = true;
        break;
      }
      // log row id, never the email (no PII)
      console.error(`[aoc/reconcile] row ${row.id} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return result;
}
