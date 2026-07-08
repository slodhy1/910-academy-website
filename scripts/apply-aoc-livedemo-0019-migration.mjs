#!/usr/bin/env node
/**
 * /aoc/livedemo · apply 0019_aoc_livedemo_abtest.sql to Supabase.
 * Usage: node --env-file=.env.local scripts/apply-aoc-livedemo-0019-migration.mjs
 * Requires SUPABASE_DB_URL. Idempotent.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error("SUPABASE_DB_URL not set."); process.exit(1); }

const sqlPath = path.resolve("supabase/migrations/0019_aoc_livedemo_abtest.sql");
const sql = readFileSync(sqlPath, "utf-8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("✓ connected");
try {
  await client.query(sql);
  console.log(`✓ migration applied (${path.basename(sqlPath)})`);
  const { rows } = await client.query(
    `select column_name, data_type, is_nullable from information_schema.columns
     where table_schema='public' and table_name='aoc_livedemo_submissions' order by ordinal_position`
  );
  console.log("\naoc_livedemo_submissions columns:");
  for (const r of rows) console.log(`  ${r.column_name.padEnd(20)} ${r.data_type.padEnd(28)} ${r.is_nullable === "YES" ? "NULL" : "NOT NULL"}`);
} finally { await client.end(); }
