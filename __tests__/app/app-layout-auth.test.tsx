import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME, signSession } from "@/app/lib/auth/session";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && mocks.cookieValue
        ? { name, value: mocks.cookieValue }
        : undefined,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  usePathname: () => "/app",
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("AuthenticatedAppLayout", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-must-be-long-enough";
    mocks.cookieValue = undefined;
    mocks.redirect.mockClear();
  });

  it("redirects unauthenticated app requests to /login", async () => {
    const { default: AuthenticatedAppLayout } = await import("@/app/(app)/app/layout");

    expect(() =>
      AuthenticatedAppLayout({
        children: <main>Today schedule</main>,
      })
    ).toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("renders the authenticated app shell when a valid session exists", async () => {
    const { default: AuthenticatedAppLayout } = await import("@/app/(app)/app/layout");
    const now = Date.now();
    mocks.cookieValue = signSession({
      sub: "user:+2348031234567",
      phone: "+2348031234567",
      iat: now,
      exp: now + 60_000,
    });

    const html = renderToStaticMarkup(
      AuthenticatedAppLayout({
        children: <main>Today schedule</main>,
      })
    );

    expect(html).toContain("Bukay");
    expect(html).toContain("+2348031234567");
    expect(html).toContain("Today schedule");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
