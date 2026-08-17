// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const routerPush = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { TopBar } from "@/app/(app)/components/topbar";

beforeEach(() => {
  routerPush.mockReset();
  routerRefresh.mockReset();
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
});

describe("TopBar user menu", () => {
  it("does not render the menu list until the trigger is clicked", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" userPhone="+2348011112222" />);

    expect(screen.queryByTestId("user-menu")).toBeNull();
    const trigger = screen.getByTestId("user-menu-trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on click and exposes Settings + Sign out entries", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" userPhone="+2348011112222" />);

    fireEvent.click(screen.getByTestId("user-menu-trigger"));

    const menu = screen.getByTestId("user-menu");
    expect(menu.getAttribute("role")).toBe("menu");
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
    expect(screen.getByTestId("user-menu-logout")).toBeTruthy();
    expect(screen.getByTestId("user-menu-trigger").getAttribute("aria-expanded")).toBe("true");
  });

  it("calls the logout endpoint and redirects to /login when sign out is clicked", async () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" />);

    fireEvent.click(screen.getByTestId("user-menu-trigger"));
    fireEvent.click(screen.getByTestId("user-menu-logout"));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" })
    );
    expect(routerPush).toHaveBeenCalledWith("/login");
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("closes the menu when Escape is pressed", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));
    expect(screen.getByTestId("user-menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("user-menu")).toBeNull();
  });

  it("closes the menu on outside click", () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <TopBar onOpenDrawer={() => undefined} tenantName="Acme" />
      </div>
    );

    fireEvent.click(screen.getByTestId("user-menu-trigger"));
    expect(screen.getByTestId("user-menu")).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId("outside"));

    expect(screen.queryByTestId("user-menu")).toBeNull();
  });

  it("calls onOpenDrawer when the mobile menu button is clicked", () => {
    const onOpenDrawer = vi.fn();
    render(<TopBar onOpenDrawer={onOpenDrawer} tenantName="Acme" />);

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("shows a 'Signed in as' section with tenant + phone when the menu opens", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" userPhone="+2348011112222" />);

    fireEvent.click(screen.getByTestId("user-menu-trigger"));

    expect(screen.getByTestId("user-menu-tenant").textContent).toBe("Acme");
    expect(screen.getByTestId("user-menu-phone").textContent).toBe("+2348011112222");
    expect(screen.getByText("Signed in as")).toBeTruthy();
  });

  it("focuses the first menuitem when the menu opens", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));

    const settings = screen.getByRole("menuitem", { name: "Settings" });
    expect(document.activeElement).toBe(settings);
  });

  it("restores focus to the trigger when the menu closes via Escape", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" />);
    const trigger = screen.getByTestId("user-menu-trigger");
    fireEvent.click(trigger);
    expect(screen.getByTestId("user-menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("user-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("moves focus between menu items with ArrowDown / ArrowUp", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));

    const settings = screen.getByRole("menuitem", { name: "Settings" });
    const logout = screen.getByTestId("user-menu-logout");
    expect(document.activeElement).toBe(settings);

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(logout);

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(settings);

    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(document.activeElement).toBe(logout);
  });

  it("jumps to first/last menu items with Home / End keys", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));

    const settings = screen.getByRole("menuitem", { name: "Settings" });
    const logout = screen.getByTestId("user-menu-logout");

    fireEvent.keyDown(document, { key: "End" });
    expect(document.activeElement).toBe(logout);

    fireEvent.keyDown(document, { key: "Home" });
    expect(document.activeElement).toBe(settings);
  });

  it("closes the menu when Tab is pressed so focus moves out naturally", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));
    expect(screen.getByTestId("user-menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.queryByTestId("user-menu")).toBeNull();
  });

  it("opens the menu when ArrowDown is pressed on the closed trigger", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" />);
    const trigger = screen.getByTestId("user-menu-trigger");
    expect(screen.queryByTestId("user-menu")).toBeNull();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    expect(screen.getByTestId("user-menu")).toBeTruthy();
    expect(screen.getByTestId("user-menu-trigger").getAttribute("aria-expanded")).toBe("true");
  });

  it("renders a WAI-ARIA separator between the account block and the menuitems", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" userPhone="+2348011112222" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));

    const separator = screen.getByTestId("user-menu-separator");
    expect(separator.getAttribute("role")).toBe("separator");
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("shows a Copy phone number menuitem only when a phone number is present", () => {
    const { rerender } = render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));
    expect(screen.queryByTestId("user-menu-copy-phone")).toBeNull();

    // close, rerender with phone, reopen
    fireEvent.keyDown(document, { key: "Escape" });
    rerender(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" userPhone="+2348011112222" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));
    const copyBtn = screen.getByTestId("user-menu-copy-phone");
    expect(copyBtn.getAttribute("role")).toBe("menuitem");
    expect(copyBtn.textContent).toBe("Copy phone number");
  });

  it("copies the phone number to the clipboard and confirms in the label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" userPhone="+2348011112222" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));
    fireEvent.click(screen.getByTestId("user-menu-copy-phone"));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writeText).toHaveBeenCalledWith("+2348011112222");
    expect(screen.getByTestId("user-menu-copy-phone").textContent).toBe("Copied phone ✓");
  });

  it("shows a Copy failed label when the clipboard API rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" userPhone="+2348011112222" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));
    fireEvent.click(screen.getByTestId("user-menu-copy-phone"));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId("user-menu-copy-phone").textContent).toBe("Copy failed");
  });

  it("keeps arrow navigation cycling through all three menuitems when phone is present", () => {
    render(<TopBar onOpenDrawer={() => undefined} tenantName="Acme" userPhone="+2348011112222" />);
    fireEvent.click(screen.getByTestId("user-menu-trigger"));

    const settings = screen.getByRole("menuitem", { name: "Settings" });
    const copy = screen.getByTestId("user-menu-copy-phone");
    const logout = screen.getByTestId("user-menu-logout");
    expect(document.activeElement).toBe(settings);

    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(copy);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(logout);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(document.activeElement).toBe(settings);
  });
});
