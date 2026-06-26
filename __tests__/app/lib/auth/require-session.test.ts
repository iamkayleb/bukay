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
}));

describe("requireSession", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-must-be-long-enough";
    mocks.cookieValue = undefined;
    mocks.redirect.mockClear();
  });

  it("returns the signed session payload when the session cookie is valid", async () => {
    const { requireSession } = await import("@/app/lib/auth/require-session");
    const now = Date.now();
    const payload = {
      sub: "user:+2348031234567",
      phone: "+2348031234567",
      iat: now,
      exp: now + 60_000,
    };
    mocks.cookieValue = signSession(payload);

    expect(requireSession()).toEqual(payload);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated requests to /login", async () => {
    const { requireSession } = await import("@/app/lib/auth/require-session");

    expect(() => requireSession()).toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects requests with an invalid session cookie to /login", async () => {
    const { requireSession } = await import("@/app/lib/auth/require-session");
    mocks.cookieValue = "not-a-valid-session";

    expect(() => requireSession()).toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
