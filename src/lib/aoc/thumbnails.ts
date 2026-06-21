import fs from "node:fs";
import path from "node:path";

const THUMB_DIR = path.join(process.cwd(), "public", "aoc", "thumbnails");

/**
 * Clean kebab-case slug of a module title, matching the thumbnail filenames:
 * lowercase, "&" -> "and", every run of other non-alphanumerics -> "-".
 * e.g. "Body Language & Tonality" -> "body-language-and-tonality",
 *      "Viral Mastery - The Science" -> "viral-mastery-the-science".
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Available thumbnail slugs (filenames without extension), read once at build.
let available: Set<string> | null = null;
function availableSlugs(): Set<string> {
  if (available) return available;
  try {
    available = new Set(
      fs
        .readdirSync(THUMB_DIR)
        .filter((f) => f.toLowerCase().endsWith(".png"))
        .map((f) => f.replace(/\.png$/i, "")),
    );
  } catch {
    available = new Set();
  }
  return available;
}

/**
 * Public path to a module's real thumbnail PNG (for next/image), resolved by
 * slugifying the title. Returns null when there's no matching file — logged so
 * the missing module is visible during the build — and the caller falls back to
 * the placeholder rather than breaking the build.
 */
export function moduleThumbnail(title: string): string | null {
  const slug = slugifyTitle(title);
  if (availableSlugs().has(slug)) return `/aoc/thumbnails/${slug}.png`;
  console.warn(`[aoc] no thumbnail for module "${title}" (slug "${slug}") — falling back to placeholder`);
  return null;
}
