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
  "products-archive",
];

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
