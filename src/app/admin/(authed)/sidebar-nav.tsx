"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Kanban, Package, FileText, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/customers", label: "Customers", Icon: Users },
  { href: "/admin/leads", label: "Leads", Icon: Kanban },
  { href: "/admin/products", label: "Products", Icon: Package },
  { href: "/admin/applications", label: "Applications", Icon: FileText },
  { href: "/admin/audit", label: "Audit Log", Icon: ScrollText },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex md:flex-col flex-row md:gap-0.5 gap-0 md:p-3 p-0 overflow-x-auto md:overflow-visible">
      {NAV.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 md:rounded-md text-sm font-medium transition-colors whitespace-nowrap",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
