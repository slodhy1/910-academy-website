#!/usr/bin/env node
/**
 * Add 'resend_account_invite' to admin_actions.action_type CHECK.
 *
 * Usage: node --env-file=.env.local scripts/apply-resend-invite-migration.mjs
 *
 * Requires SUPABASE_DB_URL in env (direct connection string, port 5432).
 * Idempotent: re-running is a no-op.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "SUPABASE_DB_URL not set. Grab it from Supabase → Project Settings → Database → Connection String → URI (direct, port 5432)."
  );
  process.exit(1);
}

const sqlPath = path.resolve(
  "supabase/migrations/0011_admin_action_resend_invite.sql"
);
const sql = readFileSync(sqlPath, "utf-8");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
console.log("✓ connected");

try {
  await client.query(sql);
  console.log(`✓ migration applied (${path.basename(sqlPath)})`);

  const { rows } = await client.query(
    `select pg_get_constraintdef(oid) as def
     from pg_constraint
     where conname = 'admin_actions_action_type_check'`
  );
  console.log("\nconstraint now:");
  for (const r of rows) console.log(`  ${r.def}`);
} finally {
  await client.end();
}
