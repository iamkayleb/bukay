import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { runForTenant } from "@/app/api/services/_helpers";
import { TEST_SESSION_SECRET, tenantRequestHeaders } from "@/__tests__/helpers/tenant-auth";

beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", TEST_SESSION_SECRET);
});

describe("runForTenant", () => {
  it("returns 401 when only x-tenant-id is present", async () => {
    const res = await runForTenant(
      new NextRequest("http://localhost/api/services", {
        headers: { "x-tenant-id": "tenant-a" },
      }),
      async () => "ok"
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
    await expect((res as Response).json()).resolves.toMatchObject({
      ok: false,
      error: "unauthorized",
    });
  });

  it("returns 401 when the session cookie is missing a tenant id", async () => {
    const res = await runForTenant(new NextRequest("http://localhost/api/services"), async () => "ok");
    expect((res as Response).status).toBe(401);
  });

  it("runs the callback under the session tenant", async () => {
    const tenantId = "run-for-tenant-session";
    const result = await runForTenant(
      new NextRequest("http://localhost/api/services", {
        headers: tenantRequestHeaders(tenantId),
      }),
      async (id) => ({ tenantId: id })
    );
    expect(result).toEqual({ tenantId });
  });

  it("returns 403 when x-tenant-id conflicts with the session", async () => {
    const res = await runForTenant(
      new NextRequest("http://localhost/api/services", {
        headers: {
          ...tenantRequestHeaders("tenant-b"),
          "x-tenant-id": "tenant-a",
        },
      }),
      async () => "ok"
    );
    expect((res as Response).status).toBe(403);
    await expect((res as Response).json()).resolves.toMatchObject({
      ok: false,
      error: "tenant_forbidden",
    });
  });

  it("runs the callback when x-tenant-id matches the session tenant", async () => {
    const tenantId = "tenant-matched-header";
    const result = await runForTenant(
      new NextRequest("http://localhost/api/services", {
        headers: {
          ...tenantRequestHeaders(tenantId),
          "x-tenant-id": tenantId,
        },
      }),
      async (id) => ({ tenantId: id })
    );
    expect(result).toEqual({ tenantId });
  });
});