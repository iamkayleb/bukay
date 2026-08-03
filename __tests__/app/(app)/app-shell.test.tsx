// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => {
  let currentPath = "/today";
  return {
    __setPath: (path: string) => {
      currentPath = path;
    },
    usePathname: () => currentPath,
    useRouter: () => ({
      push: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

const nav = (await import("next/navigation")) as unknown as {
  __setPath: (path: string) => void;
};

import { AppShell } from "@/app/(app)/components/app-shell";

beforeEach(() => {
  nav.__setPath("/today");
  document.body.style.overflow = "";
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("AppShell mobile drawer", () => {
  it("does not render the drawer by default", () => {
    render(
      <AppShell tenantName="acme" userPhone="+2348012345678">
        <div>child</div>
      </AppShell>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("opens the drawer when the topbar menu button is clicked", () => {
    render(
      <AppShell tenantName="acme">
        <div>child</div>
      </AppShell>
    );

    fireEvent.click(screen.getByLabelText("Open navigation menu"));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("locks body scroll while the drawer is open and restores it on close", () => {
    document.body.style.overflow = "auto";
    render(
      <AppShell tenantName="acme">
        <div>child</div>
      </AppShell>
    );

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByLabelText("Close navigation menu"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("closes the drawer when the backdrop is clicked", () => {
    render(
      <AppShell tenantName="acme">
        <div>child</div>
      </AppShell>
    );

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.queryByRole("dialog")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Close navigation menu"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the drawer when the pathname changes", () => {
    const { rerender } = render(
      <AppShell tenantName="acme">
        <div>child</div>
      </AppShell>
    );

    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(screen.queryByRole("dialog")).not.toBeNull();

    nav.__setPath("/calendar");
    rerender(
      <AppShell tenantName="acme">
        <div>child</div>
      </AppShell>
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
