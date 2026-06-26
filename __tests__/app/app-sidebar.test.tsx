import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "@/app/(app)/app/_components/sidebar";

const navigation = vi.hoisted(() => ({
  pathname: "/app",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

function expectActiveLink(html: string, href: string) {
  expect(html).toMatch(new RegExp(`<a (?=[^>]*aria-current="page")(?=[^>]*href="${href}")`));
}

describe("AppSidebar", () => {
  beforeEach(() => {
    navigation.pathname = "/app";
  });

  it("renders the authenticated workspace navigation", () => {
    const html = renderToStaticMarkup(<AppSidebar />);

    expect(html).toContain('aria-label="Workspace"');
    expect(html).toContain('href="/app"');
    expect(html).toContain('href="/app/calendar"');
    expect(html).toContain('href="/app/clients"');
    expect(html).toContain('href="/app/services"');
    expect(html).toContain('href="/app/settings"');
  });

  it("renders a mobile drawer variant without the desktop breakpoint classes", () => {
    const html = renderToStaticMarkup(<AppSidebar variant="mobile" onNavigate={() => undefined} />);

    expect(html).toContain('aria-label="Workspace"');
    expect(html).toContain("w-full");
    expect(html).not.toContain("md:flex");
  });

  it("marks Today active only on the app root", () => {
    const rootHtml = renderToStaticMarkup(<AppSidebar />);

    expectActiveLink(rootHtml, "/app");

    navigation.pathname = "/app/calendar";
    const calendarHtml = renderToStaticMarkup(<AppSidebar />);

    expect(calendarHtml).not.toMatch(/<a (?=[^>]*aria-current="page")(?=[^>]*href="\/app")/);
    expectActiveLink(calendarHtml, "/app/calendar");
  });

  it("keeps parent sections active on nested routes", () => {
    navigation.pathname = "/app/services/color-consult";

    const html = renderToStaticMarkup(<AppSidebar />);

    expectActiveLink(html, "/app/services");
  });
});
