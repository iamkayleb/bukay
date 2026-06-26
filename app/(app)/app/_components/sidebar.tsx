"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const appNavigationItems = [
  { label: "Today", href: "/app" },
  { label: "Calendar", href: "/app/calendar" },
  { label: "Clients", href: "/app/clients" },
  { label: "Services", href: "/app/services" },
  { label: "Settings", href: "/app/settings" },
] as const;

type AppSidebarProps = {
  onNavigate?: () => void;
  variant?: "desktop" | "mobile";
};

export function isActiveAppRoute(pathname: string, href: string): boolean {
  if (href === "/app") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ onNavigate, variant = "desktop" }: AppSidebarProps) {
  const pathname = usePathname() ?? "/app";
  const isMobile = variant === "mobile";

  return (
    <aside
      className={[
        "shrink-0 bg-slate-950 px-4 py-6 text-slate-200",
        isMobile
          ? "flex h-[calc(100%-57px)] w-full flex-col"
          : "hidden min-h-screen w-64 border-r border-slate-800 md:flex md:flex-col",
      ].join(" ")}
    >
      {isMobile ? null : (
        <div className="px-3 pb-6">
          <p className="text-sm font-semibold text-white">Bukay</p>
        </div>
      )}
      <nav aria-label="Workspace" className="flex flex-1 flex-col gap-1">
        {appNavigationItems.map((item) => {
          const active = isActiveAppRoute(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={[
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
