"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type AppTopBarProps = {
  tenantName: string;
  userPhone: string;
};

export async function requestLogout(fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl("/api/auth/logout", { method: "POST" });

  if (!response.ok) {
    throw new Error("Logout request failed");
  }
}

export function AppTopBar({ tenantName, userPhone }: AppTopBarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await requestLogout();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{tenantName}</p>
          <p className="truncate text-xs text-slate-400">Workspace</p>
        </div>

        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400 text-xs font-bold text-slate-950">
              {userPhone.slice(-2)}
            </span>
            <span className="hidden max-w-44 truncate sm:inline">{userPhone}</span>
          </button>

          {menuOpen ? (
            <div
              role="menu"
              aria-label="User menu"
              className="absolute right-0 mt-2 w-64 rounded-md border border-slate-800 bg-slate-900 p-2 shadow-xl shadow-slate-950/40"
            >
              <div className="px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Signed in
                </p>
                <p className="mt-1 truncate text-sm text-slate-100">{userPhone}</p>
              </div>
              <form onSubmit={handleLogout}>
                <button
                  type="submit"
                  role="menuitem"
                  disabled={isLoggingOut}
                  className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
