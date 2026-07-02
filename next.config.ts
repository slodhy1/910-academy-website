import type { NextConfig } from "next";

// Static HTML pages live in /public/. Vercel's cleanUrls handles extension stripping
// in production; the rewrites below give the same behavior in local dev.
const STATIC_PAGES = [
  "index",
  "about",
  "gear",
  "toolkit",
  "waitlist",
  "book",
  "coaching",
  "affiliate-guidelines",
  "maintenance",
  "products",
  "products-archive",
  "apply-claudio",
  "the-6ix",
  "aoc",
  "aoc-live",
  "levels",
];

// App-wide security headers. CSP is intentionally NOT set here: the static
// marketing pages (/aoc etc.) rely on inline <style>/<script>, so a strict CSP
// needs nonces/hashes (a separate decision). These are the safe, non-breaking set.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // Serve next/image output as AVIF first, then WebP (smaller than the source PNGs
  // on /aoc/preview). Phones download appropriately sized, modern formats.
  images: {
    formats: ["image/avif", "image/webp"],
  },
  outputFileTracingIncludes: {
    "src/app/api/stripe-webhook/route.ts": ["./emails/**/*.html"],
    "src/app/api/claudio-application/route.ts": ["./emails/**/*.html"],
    // /levels free-event confirmation email template (read at runtime by levels-confirm.ts)
    "src/app/api/aoc-event/register/route.ts": ["./emails/**/*.html"],
    // Note: admin grant notify inlines its template directly (parens/brackets
    // in the route-group path break the glob matcher, so a trace include here
    // would silently match nothing).
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      // / → /index.html (homepage)
      { source: "/", destination: "/index.html" },
      // top-level static pages: /about → /about.html, etc.
      ...STATIC_PAGES.filter((p) => p !== "index").map((p) => ({
        source: `/${p}`,
        destination: `/${p}.html`,
      })),
      // allowed product pages (others are gated by vercel.json maintenance rewrite in prod)
      { source: "/products/lucid-horizon-workshop", destination: "/products/lucid-horizon-workshop.html" },
      { source: "/products/known-productions-workshop", destination: "/products/known-productions-workshop.html" },
      { source: "/products/jt-visuals-workshop", destination: "/products/jt-visuals-workshop.html" },
      { source: "/products/instagram-masterclass", destination: "/products/instagram-masterclass.html" },
      { source: "/products/910-admin-assistant", destination: "/products/910-admin-assistant.html" },
      { source: "/products/3d-made-easy", destination: "/products/3d-made-easy.html" },
      { source: "/products/910-sales-system", destination: "/products/910-sales-system.html" },
      // AOC waitlist thank-you page (nested static page)
      { source: "/aoc/thanks", destination: "/aoc/thanks.html" },
      { source: "/aoc/join", destination: "/aoc/join.html" },
      // 24-hour expiring free-training funnel (prod serves via cleanUrls)
      { source: "/aoc/free-training", destination: "/aoc/free-training.html" },
      // Free live-event (/levels) confirmation page (nested static page)
      { source: "/levels/thanks", destination: "/levels/thanks.html" },
    ];
  },
};

export default nextConfig;
