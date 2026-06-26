import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppSidebar,
  appNavigationItems,
  isActiveAppRoute,
} from "@/app/(app)/app/_components/sidebar";

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
    for (const item of appNavigationItems) {
      expect(html).toContain(`href="${item.href}"`);
      expect(html).toContain(`>${item.label}</a>`);
    }
  });

  it("renders the same navigation targets in the mobile drawer variant", () => {
    const html = renderToStaticMarkup(<AppSidebar variant="mobile" onNavigate={() => undefined} />);

    expect(html).toContain('aria-label="Workspace"');
    expect(html).toContain("w-full");
    expect(html).not.toContain("md:flex");
    for (const item of appNavigationItems) {
      expect(html).toContain(`href="${item.href}"`);
      expect(html).toContain(`>${item.label}</a>`);
    }
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

  it("maps every navigation target to the matching active route state", () => {
    for (const item of appNavigationItems) {
      expect(isActiveAppRoute(item.href, item.href)).toBe(true);
    }

    expect(isActiveAppRoute("/app/calendar/week", "/app/calendar")).toBe(true);
    expect(isActiveAppRoute("/app/calendar", "/app")).toBe(false);
    expect(isActiveAppRoute("/app/services-extra", "/app/services")).toBe(false);
  });
});
