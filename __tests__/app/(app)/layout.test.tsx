import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => {
  const cookieMap = new Map<string, { value: string }>();
  const headerMap = new Map<string, string>();
  return {
    __setCookie: (name: string, value: string | undefined) => {
      if (value === undefined) {
        cookieMap.delete(name);
      } else {
        cookieMap.set(name, { value });
      }
    },
    __setHeader: (name: string, value: string | undefined) => {
      if (value === undefined) {
        headerMap.delete(name.toLowerCase());
      } else {
        headerMap.set(name.toLowerCase(), value);
      }
    },
    __reset: () => {
      cookieMap.clear();
      headerMap.clear();
    },
    cookies: () => ({
      get: (name: string) => cookieMap.get(name),
    }),
    headers: () => ({
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    }),
  };
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    const err = new Error(`__REDIRECT__:${path}`);
    (err as { digest?: string }).digest = `NEXT_REDIRECT;${path}`;
    throw err;
  },
}));

import AuthenticatedLayout from "@/app/(app)/layout";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, signSession } from "@/app/lib/auth/session";

const headersMod = (await import("next/headers")) as unknown as {
  __setCookie: (name: string, value: string | undefined) => void;
  __setHeader: (name: string, value: string | undefined) => void;
  __reset: () => void;
};

const PREVIOUS_SECRET = process.env.SESSION_SECRET;

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-value-1234567890";
  headersMod.__reset();
});

afterEach(() => {
  process.env.SESSION_SECRET = PREVIOUS_SECRET;
});

describe("(app) authenticated layout", () => {
  it("redirects to /login when no session cookie is present", () => {
    expect(() =>
      AuthenticatedLayout({ children: null as unknown as React.ReactNode })
    ).toThrowError(/__REDIRECT__:\/login/);
  });

  it("redirects to /login when the cookie token is invalid", () => {
    headersMod.__setCookie(SESSION_COOKIE_NAME, "not.a.valid.token");
    expect(() =>
      AuthenticatedLayout({ children: null as unknown as React.ReactNode })
    ).toThrowError(/__REDIRECT__:\/login/);
  });

  it("renders the app shell with the session phone when authenticated", () => {
    const now = Date.now();
    const token = signSession({
      sub: "user-1",
      phone: "+2348012345678",
      iat: now,
      exp: now + SESSION_TTL_MS,
    });
    headersMod.__setCookie(SESSION_COOKIE_NAME, token);
    headersMod.__setHeader("host", "acme.example.com");

    const result = AuthenticatedLayout({
      children: "child-content" as unknown as React.ReactNode,
    }) as unknown as {
      type: { displayName?: string; name?: string };
      props: { tenantName: string; userPhone?: string; children: unknown };
    };

    const componentName = result.type.displayName ?? result.type.name;
    expect(componentName).toBe("AppShell");
    expect(result.props.userPhone).toBe("+2348012345678");
    expect(result.props.tenantName).toBe("acme");
    expect(result.props.children).toBe("child-content");
  });

  it("falls back to a default tenant name when none can be resolved", () => {
    const now = Date.now();
    const token = signSession({
      sub: "user-2",
      phone: "+2348011112222",
      iat: now,
      exp: now + SESSION_TTL_MS,
    });
    headersMod.__setCookie(SESSION_COOKIE_NAME, token);

    const result = AuthenticatedLayout({
      children: null as unknown as React.ReactNode,
    }) as unknown as { props: { tenantName: string } };

    expect(result.props.tenantName).toBe("Bukay");
  });
});
