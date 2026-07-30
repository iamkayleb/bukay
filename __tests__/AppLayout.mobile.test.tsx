// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  usePathname: () => "/today",
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
  document.body.style.overflow = "";
});

describe("AppLayout mobile drawer", () => {
  it("opens and closes the mobile navigation drawer", () => {
    renderAppShell();

    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes the mobile drawer when a navigation link is clicked", () => {
    renderAppShell();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

    const drawer = screen.getByRole("dialog");
    fireEvent.click(within(drawer).getByRole("link", { name: "Calendar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
