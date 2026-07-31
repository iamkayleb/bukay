import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  runWithTenantContext: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.tenantFindUnique,
    },
  },
}));

vi.mock("@/app/tenancy/tenant-context", () => ({
  runWithTenantContext: state.runWithTenantContext,
}));

import { withTenantScope } from "@/src/middleware/tenantContext";

beforeEach(() => {
  state.tenantFindUnique.mockReset();
  state.runWithTenantContext.mockReset();
  state.runWithTenantContext.mockImplementation(
    async (_ctx: { tenantId: string }, fn: () => unknown) => fn()
  );
});

describe("withTenantScope", () => {
  it("resolves the tenant from a subdomain and runs the handler in context", async () => {
    state.tenantFindUnique.mockResolvedValue({ id: "tenant-abc" });

    const req = new NextRequest("http://acme.app.test/api/foo");
    const result = await withTenantScope(req, async (tenantId) => ({ tenantId }));

    expect(state.tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "acme" },
      select: { id: true },
    });
    expect(state.runWithTenantContext).toHaveBeenCalledWith(
      { tenantId: "tenant-abc" },
      expect.any(Function)
    );
    expect(result).toEqual({ tenantId: "tenant-abc" });
  });

  it("returns 400 when no tenant is resolvable", async () => {
    const req = new NextRequest("http://app.test/api/foo");
    const res = (await withTenantScope(req, async () => "unreachable")) as Response;

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("tenant_required");
  });

  it("returns 404 when the subdomain does not resolve to a tenant", async () => {
    state.tenantFindUnique.mockResolvedValue(null);

    const req = new NextRequest("http://unknown.app.test/api/foo");
    const res = (await withTenantScope(req, async () => "unreachable")) as Response;

    expect(res.status).toBe(404);
  });

  it("does NOT trust an x-tenant-id request header", async () => {
    const req = new NextRequest("http://app.test/api/foo", {
      headers: { "x-tenant-id": "hostile-tenant" },
    });

    const res = (await withTenantScope(req, async () => "unreachable")) as Response;

    expect(res.status).toBe(400);
    expect(state.tenantFindUnique).not.toHaveBeenCalled();
    expect(state.runWithTenantContext).not.toHaveBeenCalled();
  });
});
