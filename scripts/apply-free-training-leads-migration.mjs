#!/usr/bin/env node
/**
 * /aoc/free-training · apply 0016_free_training_leads.sql to Supabase.
 *
 * Usage: node --env-file=.env.local scripts/apply-free-training-leads-migration.mjs
 *
 * Requires SUPABASE_DB_URL (direct connection string, port 5432).
 * Idempotent: re-running is a no-op (create table if not exists).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL not set.");
  process.exit(1);
}

const sqlPath = path.resolve("supabase/migrations/0016_free_training_leads.sql");
const sql = readFileSync(sqlPath, "utf-8");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("✓ connected");

try {
  await client.query(sql);
  console.log(`✓ migration applied (${path.basename(sqlPath)})`);

  const { rows } = await client.query(
    `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema = 'public' and table_name = 'aoc_free_training_leads'
     order by ordinal_position`
  );
  console.log("\naoc_free_training_leads columns:");
  for (const r of rows) {
    console.log(
      `  ${r.column_name.padEnd(20)} ${r.data_type.padEnd(28)} ${r.is_nullable === "YES" ? "NULL" : "NOT NULL"}${r.column_default ? "  default: " + r.column_default : ""}`
    );
  }
} finally {
  await client.end();
}
