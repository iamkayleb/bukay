import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/app/(app)/app/_components/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("AppShell", () => {
  it("renders the desktop navigation and mobile drawer trigger around app content", () => {
    const html = renderToStaticMarkup(
      <AppShell tenantName="Studio Kay" userPhone="+2348031234567">
        <main>Today schedule</main>
      </AppShell>
    );

    expect(html).toContain('aria-label="Workspace"');
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('aria-controls="mobile-navigation"');
    expect(html).toContain("Today schedule");
    expect(html).not.toContain('role="dialog"');
  });
});
