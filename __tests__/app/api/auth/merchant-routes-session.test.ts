import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { GET as GET_BOOKINGS } from "@/app/api/bookings/route";
import { GET as GET_BUSINESS_HOURS } from "@/app/api/business-hours/route";
import { TEST_SESSION_SECRET, tenantRequestHeaders } from "@/__tests__/helpers/tenant-auth";

beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", TEST_SESSION_SECRET);
});

describe("merchant routes reject header-only tenant impersonation", () => {
  it("GET /api/business-hours returns 401 when only x-tenant-id is present", async () => {
    const res = await GET_BUSINESS_HOURS(
      new NextRequest("http://localhost/api/business-hours", {
        headers: { "x-tenant-id": "tenant-header-only" },
      })
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("GET /api/bookings returns 401 when only x-tenant-id is present", async () => {
    const res = await GET_BOOKINGS(
      new NextRequest("http://localhost/api/bookings?from=2026-01-01&to=2026-01-31", {
        headers: { "x-tenant-id": "tenant-header-only" },
      })
    );
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("GET /api/business-hours returns 403 when x-tenant-id conflicts with the session", async () => {
    const res = await GET_BUSINESS_HOURS(
      new NextRequest("http://localhost/api/business-hours", {
        headers: {
          ...tenantRequestHeaders("tenant-session"),
          "x-tenant-id": "tenant-other",
        },
      })
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "tenant_forbidden" });
  });

  it("GET /api/bookings returns 403 when x-tenant-id conflicts with the session", async () => {
    const res = await GET_BOOKINGS(
      new NextRequest("http://localhost/api/bookings?from=2026-01-01&to=2026-01-31", {
        headers: {
          ...tenantRequestHeaders("tenant-session"),
          "x-tenant-id": "tenant-other",
        },
      })
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "tenant_forbidden" });
  });
});
