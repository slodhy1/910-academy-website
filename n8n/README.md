# n8n — AOC waitlist → Kit reconciliation

Durable backfill for the AOC waitlist. The `/api/aoc/waitlist` route writes the
Supabase row first (durable) and then tries Kit best-effort; if Kit fails (429,
network, bad key), the row is saved with `kit_synced = false`. This workflow
sweeps those rows every 5 minutes and finishes the Kit sync.

## What it does

Every 5 minutes:
1. **Get unsynced rows** — `GET aoc_waitlist?kit_synced=eq.false` (service role).
2. **Kit: create subscriber** — `POST /v4/subscribers` (Kit returns the existing
   subscriber on duplicate email). Retries with backoff.
3. **Kit: apply waitlist tag** — `POST /v4/tags/<KIT_TAG_ID_AOC_WAITLIST>/subscribers/<id>`
   (this is the hook the welcome automation triggers on). Retries with backoff.
4. **Supabase: mark synced** — `PATCH` the row → `kit_synced = true`,
   `kit_subscriber_id = <id>`.

A row that still fails after retries is left `kit_synced = false` and picked up
on the next run (the Kit nodes use `Continue On Error`, so one bad row never
blocks the rest of the batch).

## Setup

1. **Import** `aoc-kit-reconciliation.json` into n8n (Workflows → Import from File).
2. This workflow reads secrets from n8n **environment variables** via `{{ $env.* }}`.
   Set these on your n8n instance and enable env access in expressions
   (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`):
   - `SUPABASE_URL` — e.g. `https://qkmkxthpeapuecobahhx.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `KIT_API_KEY`
   - `KIT_TAG_ID_AOC_WAITLIST` — `20270485`

   Prefer not to expose `$env`? Replace the header expressions with n8n
   **credentials** (HTTP Header Auth for Kit's `X-Kit-Api-Key`, and apikey/Bearer
   for Supabase) and hardcode the Supabase URL + tag id in the nodes.
3. **Activate** the workflow.

## Backoff note

n8n's per-node retry (Max Tries + Wait Between Tries) spaces retries out, which
covers transient Kit/Supabase errors and rate limits. For strict exponential
backoff with `Retry-After` handling, run the reference script instead (below) —
it implements true exponential backoff and honors Kit's 429 `Retry-After`.

## Reference script / cron fallback

`scripts/reconcile-aoc-kit.mjs` is the tested reference implementation of the
exact same logic (exponential backoff, 429 `Retry-After`). Use it to verify
reconciliation locally or as a cron fallback:

```
node --env-file=.env.local scripts/reconcile-aoc-kit.mjs
```

Env: `SUPABASE_DB_URL`, `KIT_API_KEY`, `KIT_TAG_ID_AOC_WAITLIST`.
