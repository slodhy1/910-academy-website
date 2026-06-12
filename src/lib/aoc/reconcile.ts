import { createAdminClient } from "@/lib/supabase/admin";

/**
 * AOC waitlist -> Kit reconciliation.
 *
 * Sweeps aoc_waitlist rows that the signup route couldn't sync to Kit
 * (kit_synced = false) and finishes the job: create/upsert the subscriber,
 * apply the waitlist tag, then flip kit_synced = true. Each Kit call uses
 * exponential backoff and honors a 429 Retry-After. A row that still fails is
 * left for the next run.
 *
 * Used by the Vercel Cron route GET /api/aoc/reconcile.
 * Secrets read from env only: KIT_API_KEY, KIT_TAG_ID_AOC_WAITLIST.
 */

const KIT_BASE = "https://api.kit.com/v4";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class KitError extends Error {
  retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

/** Run fn with exponential backoff; honors a 429 Retry-After via KitError.retryAfterMs. */
async function withBackoff<T>(fn: () => Promise<T>, tries = 5, base = 1000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === tries - 1) break;
      const retryAfter = err instanceof KitError ? err.retryAfterMs : undefined;
      await sleep(retryAfter ?? base * Math.pow(2, i));
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
    const text = await res.text().catch(() => "");
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      const retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 60_000;
      throw new KitError(`Kit ${path} -> 429 ${text}`.trim(), retryAfterMs);
    }
    throw new KitError(`Kit ${path} -> ${res.status} ${res.statusText} ${text}`.trim());
  }
  return res.json().catch(() => ({}));
}

export interface ReconcileResult {
  processed: number;
  synced: number;
  failed: number;
}

export async function reconcileKit({ limit = 40 }: { limit?: number } = {}): Promise<ReconcileResult> {
  const apiKey = process.env.KIT_API_KEY;
  const tagId = process.env.KIT_TAG_ID_AOC_WAITLIST;
  if (!apiKey || !tagId) {
    throw new Error("Kit env missing (KIT_API_KEY / KIT_TAG_ID_AOC_WAITLIST)");
  }

  const sb = createAdminClient();
  const { data: rows, error } = await sb
    .from("aoc_waitlist")
    .select("id, first_name, email")
    .eq("kit_synced", false)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Supabase select failed: ${error.message}`);

  const result: ReconcileResult = { processed: rows?.length ?? 0, synced: 0, failed: 0 };

  for (const row of rows ?? []) {
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
        .from("aoc_waitlist")
        .update({ kit_subscriber_id: subscriberId, kit_synced: true })
        .eq("id", row.id);
      if (updErr) throw new Error(`Supabase update failed: ${updErr.message}`);

      result.synced++;
    } catch (err) {
      // leave kit_synced = false; the next run retries this row
      result.failed++;
      console.error(`[aoc/reconcile] ${row.email} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return result;
}
