"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "./nav-items";

type SidebarProps = {
  onNavigate?: () => void;
  className?: string;
};

export function Sidebar({ onNavigate, className }: SidebarProps) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Primary navigation"
      className={
        "flex h-full flex-col gap-1 border-r border-slate-800 bg-slate-950 px-3 py-6" +
        (className ? ` ${className}` : "")
      }
    >
      <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
        Bukay
      </p>
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white")
                }
                href={item.href}
                onClick={onNavigate}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
