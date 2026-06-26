"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { label: "Today", href: "/app" },
  { label: "Calendar", href: "/app/calendar" },
  { label: "Clients", href: "/app/clients" },
  { label: "Services", href: "/app/services" },
  { label: "Settings", href: "/app/settings" },
];

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/app") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname() ?? "/app";

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 border-r border-slate-800 bg-slate-950 px-4 py-6 text-slate-200 md:flex md:flex-col">
      <div className="px-3 pb-6">
        <p className="text-sm font-semibold text-white">Bukay</p>
      </div>
      <nav aria-label="Workspace" className="flex flex-1 flex-col gap-1">
        {navigationItems.map((item) => {
          const active = isActiveRoute(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
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
