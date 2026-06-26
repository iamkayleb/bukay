"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";

type AppShellProps = {
  tenantName: string;
  userPhone?: string;
  children: React.ReactNode;
};

export function AppShell({ tenantName, userPhone, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 md:block">
          <Sidebar />
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <TopBar
            onOpenDrawer={() => setDrawerOpen(true)}
            tenantName={tenantName}
            userPhone={userPhone}
          />
          <main className="flex-1">{children}</main>
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <button
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-slate-950/70"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[80vw] shadow-xl">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
