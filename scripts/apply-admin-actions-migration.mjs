#!/usr/bin/env node
/**
 * Phase G4 A3: apply 0008_admin_actions.sql to Supabase.
 *
 * Usage: node --env-file=.env.local scripts/apply-admin-actions-migration.mjs
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

const sqlPath = path.resolve("supabase/migrations/0008_admin_actions.sql");
const sql = readFileSync(sqlPath, "utf-8");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log(`✓ connected`);

try {
  await client.query(sql);
  console.log(`✓ migration applied (${path.basename(sqlPath)})`);

  const { rows: structure } = await client.query(
    `select column_name, data_type, is_nullable
     from information_schema.columns
     where table_schema = 'public' and table_name = 'admin_actions'
     order by ordinal_position`
  );
  console.log("\nadmin_actions columns:");
  for (const r of structure) {
    console.log(
      `  ${r.column_name.padEnd(20)} ${r.data_type.padEnd(28)} ${r.is_nullable === "YES" ? "NULL" : "NOT NULL"}`
    );
  }

  const { rows: counts } = await client.query(
    "select count(*)::int as c from public.admin_actions"
  );
  console.log(`\nrows in admin_actions: ${counts[0].c}`);
} finally {
  await client.end();
}
