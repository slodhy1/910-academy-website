import { requireAdmin, getSiteName } from "@/lib/admin/auth";
import { SidebarNav } from "./sidebar-nav";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function AdminAuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  const siteName = getSiteName();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="md:w-60 md:border-r border-b md:border-b-0 border-sidebar-border bg-sidebar text-sidebar-foreground flex-shrink-0">
        <div className="px-5 py-6 border-b border-sidebar-border">
          <p className="text-base font-bold tracking-wide leading-none">{siteName}</p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mt-2">
            Admin
          </p>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border h-14 px-5 flex items-center justify-end gap-4 sticky top-0 z-10 bg-background/80 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline truncate max-w-[240px]" title={user.email ?? undefined}>
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
