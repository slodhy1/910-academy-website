#!/usr/bin/env node
/**
 * Phase G5 follow-up: bump footer copyright font size from 0.75rem (12px)
 * to 13px so the line matches the footer-socials sibling at the bottom of
 * each marketing page. Idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const EXCLUDE = new Set(["apply-claudio.html"]);

const repoRoot = path.resolve(import.meta.dirname, "..");
process.chdir(repoRoot);

const files = execSync("find public -name '*.html' -type f", { encoding: "utf-8" })
  .trim()
  .split("\n")
  .filter((p) => p && !EXCLUDE.has(path.basename(p)));

const RE = /(\.footer-copy\s*\{[^}]*font-size:\s*)0\.75rem/;

let patched = 0;
let skipped = 0;
let unchanged = 0;

for (const file of files) {
  const before = readFileSync(file, "utf-8");
  if (before.includes(".footer-copy") && /\.footer-copy\s*\{[^}]*font-size:\s*13px/.test(before)) {
    unchanged++;
    console.log(`  already 13px ${file}`);
    continue;
  }
  if (!RE.test(before)) {
    skipped++;
    console.warn(`  [warn] ${file}: no matching .footer-copy { font-size: 0.75rem rule`);
    continue;
  }
  const after = before.replace(RE, "$113px");
  writeFileSync(file, after, "utf-8");
  patched++;
  console.log(`  patched ${file}`);
}

console.log(`\n=== ${patched} patched, ${unchanged} already 13px, ${skipped} skipped ===`);
if (skipped > 0) process.exit(1);
