"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type TopBarProps = {
  tenantName: string;
  userPhone?: string;
  onOpenDrawer: () => void;
};

export function TopBar({ tenantName, userPhone, onOpenDrawer }: TopBarProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!menuOpen) {
      if (wasOpenRef.current) {
        triggerRef.current?.focus();
        wasOpenRef.current = false;
      }
      return;
    }
    wasOpenRef.current = true;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[0]?.focus();

    function onDocClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const list = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (!list || list.length === 0) return;
      event.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      const currentIndex = Array.from(list).indexOf(active as HTMLElement);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (currentIndex + delta + list.length) % list.length;
      list[nextIndex].focus();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setMenuOpen(false);
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
      <div className="relative" ref={menuRef}>
        <button
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Open user menu"
          className="flex items-center gap-2 rounded-md border border-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:border-emerald-400"
          data-testid="user-menu-trigger"
          onClick={() => setMenuOpen((v) => !v)}
          ref={triggerRef}
          type="button"
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-semibold uppercase text-emerald-200"
          >
            {tenantName.slice(0, 2)}
          </span>
          {userPhone ? (
            <span className="hidden text-xs text-slate-300 sm:inline" data-testid="user-phone">
              {userPhone}
            </span>
          ) : (
            <span className="hidden text-xs text-slate-300 sm:inline">Account</span>
          )}
          <svg
            aria-hidden="true"
            className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
            fill="none"
            height="12"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="12"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {menuOpen ? (
          <div
            aria-label="User menu"
            className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-md border border-slate-800 bg-slate-950 shadow-xl"
            data-testid="user-menu"
            role="menu"
          >
            <div className="border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Signed in as</p>
              <p className="mt-0.5 font-medium text-slate-200" data-testid="user-menu-tenant">
                {tenantName}
              </p>
              {userPhone ? (
                <p className="mt-0.5 truncate" data-testid="user-menu-phone">
                  {userPhone}
                </p>
              ) : null}
            </div>
            <Link
              className="block px-3 py-2 text-xs text-slate-100 hover:bg-slate-900"
              href="/settings"
              onClick={() => setMenuOpen(false)}
              role="menuitem"
            >
              Settings
            </Link>
            <button
              className="block w-full px-3 py-2 text-left text-xs text-slate-100 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="user-menu-logout"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              role="menuitem"
              type="button"
            >
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
