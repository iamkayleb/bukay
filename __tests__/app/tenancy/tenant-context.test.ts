import { describe, expect, it } from "vitest";
import {
  requireTenantContext,
  runWithTenantContext,
  tenantContext,
} from "@/app/tenancy/tenant-context";

describe("tenantContext", () => {
  it("exposes the tenant across asynchronous work", async () => {
    await runWithTenantContext({ tenantId: " tenant-123 " }, async () => {
      await Promise.resolve();

      expect(tenantContext.getStore()).toEqual({ tenantId: "tenant-123" });
      expect(requireTenantContext()).toEqual({ tenantId: "tenant-123" });
    });
  });

  it("isolates concurrent tenant contexts", async () => {
    const tenantIds = await Promise.all(
      ["tenant-a", "tenant-b"].map((tenantId) =>
        runWithTenantContext({ tenantId }, async () => {
          await new Promise((resolve) => setTimeout(resolve, tenantId === "tenant-a" ? 5 : 0));
          return requireTenantContext().tenantId;
        })
      )
    );

    expect(tenantIds).toEqual(["tenant-a", "tenant-b"]);
  });

  it("restores the parent context after a nested context finishes", () => {
    runWithTenantContext({ tenantId: "parent" }, () => {
      runWithTenantContext({ tenantId: "child" }, () => {
        expect(requireTenantContext().tenantId).toBe("child");
      });

      expect(requireTenantContext().tenantId).toBe("parent");
    });
  });

  it("rejects an empty tenant ID", () => {
    expect(() => runWithTenantContext({ tenantId: "  " }, () => undefined)).toThrowError(
      "Tenant context requires a tenantId"
    );
  });

  it("throws when required outside a tenant context", () => {
    expect(() => requireTenantContext()).toThrowError("Tenant context is not available");
  });
});
