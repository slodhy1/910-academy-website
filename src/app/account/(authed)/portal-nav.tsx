"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/account", label: "Dashboard" },
  { href: "/account/settings", label: "Settings" },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <div className="portal-nav-links">
      {ITEMS.map((item) => {
        const isActive =
          item.href === "/account"
            ? pathname === "/account"
            : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`portal-nav-link${isActive ? " portal-nav-link-active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
      <style>{`
        .portal-nav-links { display: flex; align-items: center; gap: 28px; }
        .portal-nav-link { font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); transition: color 0.2s; position: relative; padding: 4px 0; }
        .portal-nav-link:hover { color: var(--fg); }
        .portal-nav-link-active { color: var(--fg); }
        .portal-nav-link-active::after { content: ""; position: absolute; left: 0; right: 0; bottom: -2px; height: 1px; background: var(--accent); }
        @media (max-width: 600px) {
          .portal-nav-links { gap: 18px; }
          .portal-nav-link { font-size: 12px; letter-spacing: 0.1em; }
        }
      `}</style>
    </div>
  );
}
