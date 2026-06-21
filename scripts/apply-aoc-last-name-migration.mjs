#!/usr/bin/env node
/**
 * AOC · apply 0013_aoc_waitlist_last_name.sql to Supabase.
 *
 * Usage: node --env-file=.env.local scripts/apply-aoc-last-name-migration.mjs
 *
 * Requires SUPABASE_DB_URL in env (direct connection string, port 5432).
 * Idempotent: re-running is a no-op (add column if not exists).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "SUPABASE_DB_URL not set. Grab it from Supabase, Project Settings, Database, Connection String, URI (direct, port 5432)."
  );
  process.exit(1);
}

const sqlPath = path.resolve("supabase/migrations/0013_aoc_waitlist_last_name.sql");
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
     where table_schema = 'public' and table_name = 'aoc_waitlist'
     order by ordinal_position`
  );
  console.log("\naoc_waitlist columns:");
  for (const r of structure) {
    console.log(
      `  ${r.column_name.padEnd(20)} ${r.data_type.padEnd(28)} ${r.is_nullable === "YES" ? "NULL" : "NOT NULL"}`
    );
  }
} finally {
  await client.end();
}
