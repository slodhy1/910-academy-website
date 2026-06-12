#!/usr/bin/env node
/**
 * AOC waitlist -> Kit reconciliation.
 *
 * Finds aoc_waitlist rows with kit_synced = false and (re)runs the Kit sync:
 * create/upsert subscriber -> apply the waitlist tag -> set kit_synced = true.
 * Each Kit call uses exponential backoff and honors 429 Retry-After.
 *
 * This is the tested reference implementation of the n8n reconciliation workflow
 * (see n8n/aoc-kit-reconciliation.json). It can also run standalone as a cron
 * fallback:  node --env-file=.env.local scripts/reconcile-aoc-kit.mjs
 *
 * Env: SUPABASE_DB_URL, KIT_API_KEY, KIT_TAG_ID_AOC_WAITLIST
 */
import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL;
const KIT_API_KEY = process.env.KIT_API_KEY;
const KIT_TAG_ID = process.env.KIT_TAG_ID_AOC_WAITLIST;
const KIT_BASE = "https://api.kit.com/v4";
const BATCH = Number(process.env.RECONCILE_BATCH || 50);

if (!DB_URL || !KIT_API_KEY || !KIT_TAG_ID) {
  console.error("Missing env: SUPABASE_DB_URL, KIT_API_KEY, KIT_TAG_ID_AOC_WAITLIST");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run fn with exponential backoff; honors a 429 Retry-After via err.retryAfterMs. */
async function withBackoff(fn, { tries = 5, base = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === tries - 1) break;
      const wait = err && err.retryAfterMs ? err.retryAfterMs : base * Math.pow(2, i);
      console.warn(`  retry ${i + 1}/${tries - 1} in ${wait}ms (${err.message})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function kitFetch(path, body) {
  const res = await fetch(`${KIT_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Kit-Api-Key": KIT_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Kit ${path} -> ${res.status} ${res.statusText} ${text}`.trim());
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      err.retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 60000;
    }
    throw err;
  }
  return res.json().catch(() => ({}));
}

async function syncRow(client, row) {
  // create / upsert subscriber (Kit returns the existing one on duplicate email)
  const sub = await withBackoff(() =>
    kitFetch("/subscribers", { first_name: row.first_name, email_address: row.email })
  );
  const subscriberId = sub?.subscriber?.id;
  if (typeof subscriberId !== "number") throw new Error("Kit subscriber response missing id");

  // apply the waitlist tag -> triggers the welcome automation
  await withBackoff(() => kitFetch(`/tags/${KIT_TAG_ID}/subscribers/${subscriberId}`, {}));

  await client.query(
    "update public.aoc_waitlist set kit_subscriber_id = $1, kit_synced = true where id = $2",
    [subscriberId, row.id]
  );
  return subscriberId;
}

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const { rows } = await client.query(
    "select id, first_name, email from public.aoc_waitlist where kit_synced = false order by created_at asc limit $1",
    [BATCH]
  );
  console.log(`reconcile: ${rows.length} unsynced row(s)`);
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const id = await syncRow(client, row);
      ok++;
      console.log(`  ✓ ${row.email} -> kit subscriber ${id}, tagged ${KIT_TAG_ID}`);
    } catch (err) {
      failed++;
      // leave kit_synced = false; next run retries it
      console.error(`  ✗ ${row.email}: ${err.message}`);
    }
  }
  console.log(`done: ${ok} synced, ${failed} left for next run`);
} finally {
  await client.end();
}
