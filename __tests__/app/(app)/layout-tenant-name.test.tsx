import { execFileSync } from "node:child_process";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

const DEMO_SLUG = "demo";
const DEMO_NAME = "Bukay Demo Salon";
const MISSING_TENANT_ID = "cm_missing_tenant_for_layout_test_0001";

const db = new PrismaClient();
const PREVIOUS_SECRET = process.env.SESSION_SECRET;

function applyMigrations() {
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
}

async function ensureDemoTenant() {
  return db.tenant.upsert({
    where: { slug: DEMO_SLUG },
    update: { name: DEMO_NAME },
    create: {
      slug: DEMO_SLUG,
      name: DEMO_NAME,
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
  });
}

beforeAll(() => {
  applyMigrations();
});

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-value-1234567890";
  headersMod.__reset();
});

afterEach(() => {
  process.env.SESSION_SECRET = PREVIOUS_SECRET;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("(app) layout tenant display name", () => {
  it("renders the seeded tenant name for a real demo tenant", async () => {
    const tenant = await ensureDemoTenant();
    const now = Date.now();
    const token = signSession({
      sub: "owner-demo",
      phone: "+2348061778668",
      tenantId: tenant.id,
      iat: now,
      exp: now + SESSION_TTL_MS,
    });
    headersMod.__setCookie(SESSION_COOKIE_NAME, token);

    const result = (await AuthenticatedLayout({
      children: null as unknown as React.ReactNode,
    })) as unknown as { props: { tenantName: string } };

    expect(result.props.tenantName).toBe(DEMO_NAME);
    expect(result.props.tenantName).not.toMatch(/^cm[a-z0-9]{20,}$/);
  });

  it("falls back without throwing when the session tenant row is missing", async () => {
    const now = Date.now();
    const token = signSession({
      sub: "orphan-user",
      phone: "+2348011112222",
      tenantId: MISSING_TENANT_ID,
      iat: now,
      exp: now + SESSION_TTL_MS,
    });
    headersMod.__setCookie(SESSION_COOKIE_NAME, token);

    const result = await AuthenticatedLayout({
      children: null as unknown as React.ReactNode,
    });

    expect(result).toBeTruthy();
    const props = (result as unknown as { props: { tenantName: string } }).props;
    expect(props.tenantName).toBe("Bukay");
    expect(props.tenantName).not.toBe(MISSING_TENANT_ID);
  });
});
