#!/usr/bin/env node
/**
 * Phase G5: add a "Built by @slodhy" credit line to the footer of every
 * customer-facing marketing HTML page in /public.
 *
 * Idempotent: re-running on already-patched files leaves them unchanged.
 *
 * Touches:
 *   - 19 marketing HTML files (all of public/**.html except apply-claudio.html)
 *   - For each: rewrites the .footer-copy paragraph and injects a
 *     .footer-credit-link CSS rule inside the inline <style> block.
 *
 * Usage: node scripts/apply-footer-credit.mjs
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

const OLD_COPY =
  '<p class="footer-copy">&copy; 2026 910 Academy. All rights reserved.</p>';
const NEW_COPY =
  '<p class="footer-copy">&copy; 2026 910 Academy. All rights reserved. <span aria-hidden="true">&middot;</span> Built by <a class="footer-credit-link" href="https://instagram.com/slodhy" target="_blank" rel="noopener noreferrer">@slodhy</a></p>';

const CREDIT_CSS = `
.footer-credit-link { color: var(--fg-muted); text-decoration: underline; text-underline-offset: 2px; transition: color 0.2s ease; }
.footer-credit-link:hover { color: var(--accent); }`;

let patched = 0;
let skipped = 0;
let missingCopy = 0;
let missingCss = 0;

for (const file of files) {
  let html = readFileSync(file, "utf-8");
  const before = html;

  // Markup
  if (html.includes(NEW_COPY)) {
    // already patched
  } else if (html.includes(OLD_COPY)) {
    html = html.replace(OLD_COPY, NEW_COPY);
  } else {
    missingCopy++;
    console.warn(`  [warn] ${file}: no exact .footer-copy paragraph match, skipping markup change`);
  }

  // CSS rule (insert AFTER the .footer-copy CSS rule)
  if (!html.includes(".footer-credit-link")) {
    const cssAnchorRe = /(\.footer-copy\s*\{[^}]*\})/;
    const m = html.match(cssAnchorRe);
    if (m) {
      html = html.replace(cssAnchorRe, `${m[1]}${CREDIT_CSS}`);
    } else {
      missingCss++;
      console.warn(`  [warn] ${file}: no .footer-copy {...} CSS anchor, skipping CSS injection`);
    }
  }

  if (html !== before) {
    writeFileSync(file, html, "utf-8");
    patched++;
    console.log(`  patched ${file}`);
  } else {
    skipped++;
    console.log(`  unchanged ${file}`);
  }
}

console.log(`\n=== ${patched} patched, ${skipped} unchanged ===`);
if (missingCopy > 0) console.warn(`${missingCopy} files missing the expected .footer-copy markup`);
if (missingCss > 0) console.warn(`${missingCss} files missing the expected .footer-copy CSS anchor`);
if (missingCopy > 0 || missingCss > 0) process.exit(1);
