import { describe, it, expect } from "vitest";
import {
  runWithTenant,
  getTenantContext,
  getTenantId,
  requireTenantId,
} from "@/app/lib/tenant-context";

describe("tenant-context", () => {
  it("returns undefined outside of a runWithTenant scope", () => {
    expect(getTenantContext()).toBeUndefined();
    expect(getTenantId()).toBeUndefined();
  });

  it("exposes the tenant inside the scope", () => {
    const value = runWithTenant({ tenantId: "t-acme", tenantSlug: "acme" }, () => ({
      ctx: getTenantContext(),
      id: getTenantId(),
    }));
    expect(value.id).toBe("t-acme");
    expect(value.ctx).toEqual({ tenantId: "t-acme", tenantSlug: "acme" });
  });

  it("propagates across awaited boundaries", async () => {
    const id = await runWithTenant({ tenantId: "t-acme" }, async () => {
      await Promise.resolve();
      return getTenantId();
    });
    expect(id).toBe("t-acme");
  });

  it("isolates nested scopes", () => {
    const outer = runWithTenant({ tenantId: "t-acme" }, () => {
      const inner = runWithTenant({ tenantId: "t-globex" }, () => getTenantId());
      return { inner, outer: getTenantId() };
    });
    expect(outer).toEqual({ inner: "t-globex", outer: "t-acme" });
  });

  it("requireTenantId throws outside a scope", () => {
    expect(() => requireTenantId()).toThrow(/No tenant in context/);
  });
});
