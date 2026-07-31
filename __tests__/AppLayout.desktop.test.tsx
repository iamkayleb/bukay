// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NAV_ITEMS } from "@/app/(app)/components/nav-items";

const navState = vi.hoisted(() => ({
  pathname: "/today",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { AppShell } from "@/app/(app)/components/app-shell";

function renderAppShell() {
  return render(
    <AppShell tenantName="Test Workspace" userPhone="+2348012345678">
      <section>Authenticated content</section>
    </AppShell>
  );
}

afterEach(() => {
  cleanup();
  navState.pathname = "/today";
  document.body.style.overflow = "";
});

describe("AppLayout desktop sidebar navigation", () => {
  it("renders every desktop sidebar navigation link with the expected destination", () => {
    renderAppShell();

    const desktopNav = screen.getByRole("navigation", { name: "Primary navigation" });
    const links = within(desktopNav).getAllByRole("link");

    expect(links).toHaveLength(NAV_ITEMS.length);
    NAV_ITEMS.forEach((item, index) => {
      expect(links[index].textContent).toBe(item.label);
      expect(links[index].getAttribute("href")).toBe(item.href);

      fireEvent.click(links[index]);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("marks the matching desktop sidebar link active for nested routes", () => {
    navState.pathname = "/clients/client-123";

    renderAppShell();

    const desktopNav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(
      within(desktopNav).getByRole("link", { name: "Clients" }).getAttribute("aria-current")
    ).toBe("page");
    expect(
      within(desktopNav).getByRole("link", { name: "Calendar" }).hasAttribute("aria-current")
    ).toBe(false);
  });
});
