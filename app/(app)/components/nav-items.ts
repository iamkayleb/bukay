export type NavItem = {
  href: string;
  label: string;
};

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { href: "/today", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/clients", label: "Clients" },
  { href: "/services", label: "Services" },
  { href: "/settings", label: "Settings" },
];

export function isActivePath(currentPath: string, target: string): boolean {
  if (!currentPath) return false;
  if (currentPath === target) return true;
  return currentPath.startsWith(`${target}/`);
}
