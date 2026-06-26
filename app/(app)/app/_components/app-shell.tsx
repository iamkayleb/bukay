"use client";

import { useState } from "react";

import { AppSidebar } from "./sidebar";
import { AppTopBar } from "./top-bar";

type AppShellProps = {
  children: React.ReactNode;
  tenantName: string;
  userPhone: string;
};

export function AppShell({ children, tenantName, userPhone }: AppShellProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  function closeMobileNavigation() {
    setMobileNavigationOpen(false);
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar variant="desktop" />

      {mobileNavigationOpen ? (
        <div
          id="mobile-navigation"
          aria-label="Mobile navigation"
          aria-modal="true"
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
        >
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 h-full w-full bg-slate-950/70"
            onClick={closeMobileNavigation}
          />
          <div className="relative h-full w-72 max-w-[85vw] border-r border-slate-800 bg-slate-950 shadow-2xl shadow-slate-950/60">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <p className="text-sm font-semibold text-white">Bukay</p>
              <button
                type="button"
                aria-label="Close navigation"
                className="rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-900"
                onClick={closeMobileNavigation}
              >
                Close
              </button>
            </div>
            <AppSidebar variant="mobile" onNavigate={closeMobileNavigation} />
          </div>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <AppTopBar
          tenantName={tenantName}
          userPhone={userPhone}
          onOpenMobileNavigation={() => setMobileNavigationOpen(true)}
        />
        {children}
      </div>
    </div>
  );
}
