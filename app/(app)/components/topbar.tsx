"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TopBarProps = {
  tenantName: string;
  userPhone?: string;
  onOpenDrawer: () => void;
};

export function TopBar({ tenantName, userPhone, onOpenDrawer }: TopBarProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { Accept: "application/json" } });
    } catch {
      // ignore — we still redirect to login below
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          aria-label="Open navigation menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-800 text-slate-200 hover:border-emerald-400 md:hidden"
          onClick={onOpenDrawer}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="18"
          >
            <line x1="3" x2="21" y1="6" y2="6" />
            <line x1="3" x2="21" y1="12" y2="12" />
            <line x1="3" x2="21" y1="18" y2="18" />
          </svg>
        </button>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Tenant</p>
          <h1 className="text-sm font-semibold text-white sm:text-base" data-testid="tenant-name">
            {tenantName}
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {userPhone ? (
          <span className="hidden text-xs text-slate-400 sm:inline" data-testid="user-phone">
            {userPhone}
          </span>
        ) : null}
        <button
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoggingOut}
          onClick={() => void handleLogout()}
          type="button"
        >
          {isLoggingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </header>
  );
}
